import util from "node:util";
import http from "node:http";
import https from "node:https";
import got from "got";
import type pino from "pino";
import type Pulsar from "pulsar-client";
import type { HttpPollerConfig } from "./config.js";

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
    isHttp2Used,
    isUrlInPulsarMessageProperties,
    warningThresholdInSeconds,
  }: HttpPollerConfig
) => {
  // There is only one URL so the cache will not grow beyond size of 1.
  // Therefore we can use a simple Map.
  const cache = new Map();
  let httpClient = got.extend({
    retry: { limit: 0 },
    timeout: { request: requestTimeoutInSeconds * 1e3 },
    responseType: "buffer",
    cache,
    // With the default value of true, the request header Authorization would
    // prevent caching by default.
    cacheOptions: { shared: false },
    agent: {
      http: new http.Agent({ keepAlive: true }),
      https: new https.Agent({ keepAlive: true }),
    },
    headers: {
      // FIXME: Switch to name and version from package.json.
      "user-agent": "waltti-apc/dev",
    },
  });
  if (username && password) {
    httpClient = httpClient.extend({ username, password });
  }
  if (isHttp2Used) {
    httpClient = httpClient.extend({ http2: true });
  }
  const pulsarMessageProperties = isUrlInPulsarMessageProperties ? { url } : {};
  /* eslint-disable no-await-in-loop */
  for (;;) {
    try {
      const response = await httpClient.get(url);
      if (!response.isFromCache) {
        // For some reason timings is only available for responses not from the
        // cache, even if the server responded to If-None-Match to affirm the
        // freshness of the cache.
        if (
          warningThresholdInSeconds !== undefined &&
          response.timings.phases.total !== undefined &&
          response.timings.phases.total > warningThresholdInSeconds * 1e3
        ) {
          logger.warn(
            { timings: response.timings },
            `The HTTP request took over ${warningThresholdInSeconds} seconds ` +
              "to finish"
          );
        }
        const buffer = response.rawBody;
        try {
          // Let Pulsar send messages in the background instead of acking each
          // message individually.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          pulsarProducer.send({
            data: buffer,
            properties: pulsarMessageProperties,
            eventTimestamp: Date.now(),
          });
        } catch (err) {
          logger.error({ err }, "Sending to Pulsar failed");
        }
      }
    } catch (err) {
      logger.error({ err }, "HTTP request failed");
    }
    await sleep(sleepDurationInSeconds * 1e3);
  }
  /* eslint-enable no-await-in-loop */
};

export default keepPollingAndSending;
