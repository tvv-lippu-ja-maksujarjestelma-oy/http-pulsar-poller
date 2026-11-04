/* CommonJS is required by the trusted github-script loader. */
/* eslint-disable @typescript-eslint/no-require-imports */
const { classify, eligible, CONTEXT } = require("./policy.cjs");
const activation = require("./activation.json");
const PUBLISHER = "github-actions[bot]";

module.exports = async ({ github, context, core }) => {
  const repo = context.repo;
  const configured = activation.enabled;
  const pulls = context.payload.pull_request
    ? [context.payload.pull_request]
    : await github.paginate(github.rest.pulls.list, {
        ...repo,
        state: "open",
        base: "main",
        per_page: 100,
      });
  for (const candidate of pulls) {
    if (candidate.user.login !== "dependabot[bot]") continue;
    const number = candidate.number;
    let sha = candidate.head.sha;
    let cached;
    const publish = async (name, state, description) => {
      description = description.slice(0, 140);
      const previous = cached?.find(
        (s) => s.context === name && s.creator?.login === PUBLISHER,
      );
      if (previous?.state === state && previous.description === description)
        return;
      const { data: written } = await github.rest.repos.createCommitStatus({
        ...repo,
        sha,
        context: name,
        state,
        description,
      });
      cached ||= [];
      cached.unshift(written);
    };
    try {
      const { data: pr } = await github.rest.pulls.get({
        ...repo,
        pull_number: number,
      });
      sha = pr.head.sha;
      if (pr.state !== "open" || pr.base.ref !== "main") continue;
      cached = await github.paginate(
        github.rest.repos.listCommitStatusesForRef,
        { ...repo, ref: sha, per_page: 100 },
      );
      const files = await github.paginate(github.rest.pulls.listFiles, {
        ...repo,
        pull_number: number,
        per_page: 100,
      });
      if (files.length !== pr.changed_files)
        throw new Error("Incomplete file inventory");
      const commits = await github.paginate(github.rest.pulls.listCommits, {
        ...repo,
        pull_number: number,
        per_page: 100,
      });
      const read = async (ref, path) => {
        const { data } = await github.rest.repos.getContent({
          ...repo,
          ref,
          path,
        });
        if (data.encoding !== "base64" || !data.content)
          throw new Error("Unsupported file content");
        return JSON.parse(Buffer.from(data.content, "base64").toString("utf8"));
      };
      let before, after;
      if (
        files.every((f) =>
          ["package.json", "package-lock.json"].includes(f.filename),
        )
      ) {
        // Compare to current base: base drift fails conservatively to HUMAN.
        [before, after] = await Promise.all(
          [pr.base.sha, pr.head.sha].map((ref) =>
            Promise.all(
              ["package.json", "package-lock.json"].map((path) =>
                read(ref, path),
              ),
            ),
          ),
        );
      }
      const classification = classify({
        files,
        before,
        after,
        commits,
        head: sha,
      });
      const reviews = await github.paginate(github.rest.pulls.listReviews, {
        ...repo,
        pull_number: number,
        per_page: 100,
      });
      const runs = await github.paginate(github.rest.checks.listForRef, {
        ...repo,
        ref: sha,
        per_page: 100,
      });
      const { data: combined } =
        await github.rest.repos.getCombinedStatusForRef({ ...repo, ref: sha });
      const checks = ["CodeQL", "Build, check, test, push"].map((name) => {
        const run = runs.find((c) => c.name === name);
        const legacy = combined.statuses.find((c) => c.context === name);
        return run
          ? run.status === "completed"
            ? run.conclusion
            : "pending"
          : legacy?.state;
      });
      const { data: fresh } = await github.rest.pulls.get({
        ...repo,
        pull_number: number,
      });
      if (fresh.head.sha !== sha || fresh.base.sha !== pr.base.sha)
        throw new Error("Head/base changed during evaluation");
      const allowed = eligible({
        pr: fresh,
        classification,
        reviews,
        checks,
        activated: configured,
      });
      core.info(
        JSON.stringify({
          number,
          head: sha,
          ...classification,
          activated: configured,
          allowed,
        }),
      );
      await publish(
        `${CONTEXT} AUTO`,
        configured && classification.lane === "AUTO" ? "success" : "failure",
        "Immutable diff classification; never authorizes HUMAN",
      );
      await publish(
        CONTEXT,
        allowed ? "success" : "failure",
        !configured
          ? "Activation blocked: complete required-status and token-permission adoption"
          : `${classification.lane}: ${classification.reason}`,
      );
    } catch (error) {
      // Revoke cached success on the known head even when the first GET fails.
      // A rejected write cannot be made fail-closed by repository code alone.
      core.warning(`PR ${number}: ${error.message}`);
      for (const name of [`${CONTEXT} AUTO`, CONTEXT]) {
        try {
          await publish(name, "failure", `Fail closed: ${error.message}`);
        } catch (writeError) {
          core.setFailed(
            `Cannot revoke PR ${number} ${name}: ${writeError.message}`,
          );
        }
      }
    }
  }
};
/* eslint-enable @typescript-eslint/no-require-imports */
