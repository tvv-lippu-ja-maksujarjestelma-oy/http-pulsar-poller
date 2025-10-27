import util from "node:util";
import type pino from "pino";
import type Pulsar from "pulsar-client";
import { fetch, type Response } from "undici";
import type { HttpPollerConfig } from "./config";
import transformUnknownToError from "./util";

const sleep = util.promisify(setTimeout);

const keepPollingAndSending = async (
  logger: pino.Logger,
  pulsarProducer: Pulsar.Producer,
  {
    url,
    username,
    password,
    sleepDurationInSeconds,
    requestTimeoutInSeconds,
    isUrlInPulsarMessageProperties,
    logIntervalInSeconds,
    userAgent,
  }: HttpPollerConfig,
): Promise<void> => {
  logger.info(
    {
      sleepDurationInSeconds,
      requestTimeoutInSeconds,
      isUrlInPulsarMessageProperties,
      logIntervalInSeconds,
      userAgent,
    },
    "Print some configuration values to ease monitoring",
  );

  let nRecentPulsarMessages = 0;

  setInterval(() => {
    logger.info({ nRecentPulsarMessages }, "Forwarded messages to Pulsar");
    nRecentPulsarMessages = 0;
  }, logIntervalInSeconds * 1e3);

  const send = async (message: Pulsar.ProducerMessage) => {
    try {
      await pulsarProducer.send(message);
      nRecentPulsarMessages += 1;
    } catch (err) {
      logger.error(
        { err, message: JSON.stringify(message) },
        "Sending to Pulsar failed",
      );
    }
  };

  let eTag: string | null = null;
  let timeoutId: NodeJS.Timeout;
  const headersBase: Record<string, string> = { "User-Agent": userAgent };
  if (username && password) {
    headersBase["Authorization"] = `Basic ${Buffer.from(
      `${username}:${password}`,
    ).toString("base64")}`;
  }
  const pulsarMessagePropertiesBase = isUrlInPulsarMessageProperties
    ? { url }
    : {};

  /* eslint-disable no-await-in-loop */
  for (;;) {
    const controller = new AbortController();
    timeoutId = setTimeout(
      () => controller.abort(),
      requestTimeoutInSeconds * 1_000,
    );
    let response: Response | undefined;
    let arrayBuffer: ArrayBuffer | undefined;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: { ...headersBase, ...(eTag ? { "If-None-Match": eTag } : {}) },
      });
      arrayBuffer = await response.arrayBuffer();
    } catch (error) {
      const err = transformUnknownToError(error);
      if (err.name === "AbortError") {
        logger.debug({ err }, "Request took too long so it was aborted.");
      } else {
        logger.warn({ err }, "Request failed.");
      }
    } finally {
      clearTimeout(timeoutId);
    }
    if (response != null && arrayBuffer != null) {
      const newETag = response.headers.get("ETag");
      const isCached =
        response.status === 304 || (newETag !== null && newETag === eTag);
      if (isCached) {
        logger.debug(
          "The response has not changed since previous request. Skip sending to Pulsar.",
        );
      } else {
        if (!response.ok) {
          logger.warn(
            {
              responseStatus: response.status,
              responseStatusText: response.statusText,
              responseHeaders: Object.fromEntries(response.headers.entries()),
              responseBodyAsUtf8: new TextDecoder("utf8").decode(arrayBuffer),
            },
            "The response was not OK. Sending to Pulsar anyway.",
          );
        }
        const pulsarMessageProperties = {
          ...pulsarMessagePropertiesBase,
          ...{ statusCode: response.status.toString() },
        };
        const producerMessage = {
          data: Buffer.from(arrayBuffer),
          properties: pulsarMessageProperties,
          eventTimestamp: Date.now(),
        };
        // Send Pulsar messages in the background instead of blocking until the
        // Pulsar cluster has acked.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        send(producerMessage);
      }
      eTag = response.headers.get("ETag");
    }
    // For utmost simplicity, we do not send parallel HTTP requests. Instead we
    // sleep. The downside is that the rate of requests is more unpredictable.
    await sleep(sleepDurationInSeconds * 1e3);
  }
  /* eslint-enable no-await-in-loop */
};

export default keepPollingAndSending;
