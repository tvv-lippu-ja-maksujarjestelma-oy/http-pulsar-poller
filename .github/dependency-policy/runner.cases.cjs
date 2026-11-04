/* CommonJS is required by the trusted github-script loader. */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const run = require("./run.cjs");
const activation = require("./activation.json");
const { repositoryFixture } = require("./fixtures.cjs");

function mock({
  held = false,
  state = "APPROVED",
  head = "head",
  ci = "success",
  missing = false,
  changed = false,
  fixture,
  encoding = "base64",
  cached = [],
} = {}) {
  const pr = {
    number: 1,
    state: "open",
    user: { login: "dependabot[bot]" },
    base: { ref: "main", sha: "base" },
    head: { sha: head },
    labels: held ? [{ name: "hold" }] : [],
    draft: false,
    mergeable: true,
    changed_files: fixture ? 2 : 1,
  };
  const written = [];
  const methods = {
    get: async () => ({
      data: changed ? { ...pr, head: { sha: Math.random().toString() } } : pr,
    }),
    list: () => {},
    listFiles: () => {},
    listCommits: () => {},
    listReviews: () => {},
    listForRef: () => {},
    listCommitStatusesForRef: () => {},
    getContent: async ({ ref, path }) => ({
      data: {
        encoding,
        content: Buffer.from(
          JSON.stringify(
            (ref === "base" ? fixture.before : fixture.after)[
              path === "package.json" ? 0 : 1
            ],
          ),
        ).toString("base64"),
      },
    }),
    getCombinedStatusForRef: async () => ({ data: { statuses: [] } }),
    createCommitStatus: async (s) => {
      written.push(s);
      cached.unshift({
        ...s,
        creator: { login: "github-actions[bot]" },
      });
      return { data: cached[0] };
    },
  };
  const github = {
    rest: { pulls: methods, repos: methods, checks: methods },
    paginate: async (fn) => {
      if (fn === methods.listCommitStatusesForRef) return cached.slice();
      if (fn === methods.listFiles && fixture) return fixture.files;
      if (fn === methods.listFiles)
        return [{ filename: "Dockerfile", status: "modified" }];
      if (fn === methods.listCommits) return fixture?.commits || [];
      if (fn === methods.listReviews)
        return [
          { user: { login: "pnupu", type: "User" }, state, commit_id: "head" },
        ];
      if (fn === methods.listForRef)
        return missing
          ? []
          : ["CodeQL", "Build, check, test, push"].map((name) => ({
              name,
              status: "completed",
              conclusion: ci,
            }));
      throw Error("Unexpected pagination");
    },
  };
  return {
    github,
    context: {
      repo: { owner: "owner", repo: "repo" },
      payload: { pull_request: pr },
    },
    core: { info: () => {}, warning: () => {}, setFailed: () => {} },
    written,
  };
}
const final = (m) =>
  m.written.filter((s) => s.context === "Dependency policy").at(-1).state;
test("actual runner fails closed while activation is disabled", async () => {
  const m = mock();
  await run(m);
  assert.equal(final(m), "failure");
  assert.match(m.written.at(-1).description, /Activation blocked/);
});
test("actual HUMAN runner checks current pnupu approval, CI and mutable state", async () => {
  activation.enabled = true;
  try {
    const good = mock();
    await run(good);
    assert.equal(final(good), "success");
    for (const options of [
      { held: true },
      { state: "DISMISSED" },
      { head: "new" },
      { ci: "failure" },
      { ci: "pending" },
      { missing: true },
      { changed: true },
    ]) {
      const m = mock(options);
      await run(m);
      assert.equal(final(m), "failure", JSON.stringify(options));
    }
  } finally {
    activation.enabled = false;
  }
});
test("API errors revoke cached success on the known candidate head", async () => {
  const cached = [
    {
      context: "Dependency policy",
      state: "success",
      creator: { login: "github-actions[bot]" },
    },
  ];
  const m = mock({ cached });
  m.github.rest.pulls.get = async () => {
    throw Error("unavailable");
  };
  await run(m);
  assert.equal(final(m), "failure");
  assert.equal(
    cached.find((s) => s.context === "Dependency policy").state,
    "failure",
  );
});
test("actual AUTO runner decodes both real repository manifests/locks", async () => {
  activation.enabled = true;
  try {
    const m = mock({ fixture: repositoryFixture() });
    await run(m);
    assert.equal(final(m), "success");
    assert.equal(
      m.written.find((s) => s.context === "Dependency policy AUTO").state,
      "success",
    );
    const oversized = mock({ fixture: repositoryFixture(), encoding: "none" });
    await run(oversized);
    assert.equal(final(oversized), "failure");
  } finally {
    activation.enabled = false;
  }
});
test("unchanged reconciliation publishes no duplicate statuses", async () => {
  const m = mock();
  await run(m);
  const count = m.written.length;
  await run(m);
  assert.equal(m.written.length, count);
});
test("real historical AUTO payload traverses runner blob and metadata checks", async () => {
  activation.enabled = true;
  try {
    const fixture = require("./prettier-group.fixture.json");
    const m = mock({ fixture, head: fixture.head });
    await run(m);
    assert.equal(final(m), "success");
    assert.equal(
      m.written.find((s) => s.context === "Dependency policy AUTO").state,
      "success",
    );
  } finally {
    activation.enabled = false;
  }
});
test("foreign publisher cannot suppress authoritative AUTO failure", async () => {
  const cached = [
    {
      context: "Dependency policy AUTO",
      state: "success",
      description: "Immutable diff classification; never authorizes HUMAN",
      creator: { login: "foreign-app[bot]" },
    },
  ];
  const m = mock({ cached });
  await run(m);
  assert.equal(
    m.written.find((s) => s.context === "Dependency policy AUTO").state,
    "failure",
  );
});
test("failure on one PR does not stop reconciliation of later PRs", async () => {
  const m = mock();
  const first = m.context.payload.pull_request;
  const second = { ...first, number: 2 };
  m.context.payload = {};
  const paginate = m.github.paginate;
  m.github.paginate = async (fn, args) =>
    fn === m.github.rest.pulls.list ? [first, second] : paginate(fn, args);
  m.github.rest.pulls.get = async ({ pull_number }) => {
    if (pull_number === 1) throw Error("first unavailable");
    return { data: second };
  };
  await run(m);
  assert.ok(m.written.some((s) => s.description.startsWith("Fail closed")));
  assert.ok(
    m.written.some((s) => s.description.startsWith("Activation blocked")),
  );
});
test("failed policy publication revokes a newly written AUTO result", async () => {
  activation.enabled = true;
  try {
    const cached = [
      {
        context: "Dependency policy AUTO",
        state: "failure",
        description: "Fail closed: write failed",
        creator: { login: "github-actions[bot]" },
      },
    ];
    const m = mock({ fixture: repositoryFixture(), cached });
    const write = m.github.rest.repos.createCommitStatus;
    m.github.rest.repos.createCommitStatus = async (s) => {
      if (s.context === "Dependency policy" && s.state === "success")
        throw Error("write failed");
      return write(s);
    };
    await run(m);
    assert.equal(
      cached.find((s) => s.context === "Dependency policy AUTO").state,
      "failure",
    );
  } finally {
    activation.enabled = false;
  }
});
/* eslint-enable @typescript-eslint/no-require-imports */
