# http-pulsar-poller

Poll an HTTP endpoint and send the data into Apache Pulsar.

http-pulsar-poller uses a cache and only sends those HTTP responses to Pulsar that were not read from the cache.

## Development

1. Create a suitable `.env` file for configuration.
   Check below for the configuration reference.
1. Create any necessary secrets that the `.env` file points to.
1. Install dependencies:

   ```sh
   npm install
   ```

1. Run linters and tests and build:

   ```sh
   npm run check-and-build
   ```

1. Load the environment variables:

   ```sh
   set -a
   source .env
   set +a
   ```

1. Run the application:

   ```sh
   npm start
   ```

## Configuration

| Environment variable                  | Required? | Default value | Description                                                                                                                                                                                                             |
| ------------------------------------- | --------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HEALTH_CHECK_PORT`                   | ❌ No     | `8080`        | Which port to use to respond to health checks.                                                                                                                                                                          |
| `HTTP_IS_HTTP2_USED`                  | ❌ No     | `false`       | Whether to use HTTP/2 instead of HTTP/1.x.                                                                                                                                                                              |
| `HTTP_PASSWORD_PATH`                  | ❌ No     |               | The path to the file containing the password for the "Basic" HTTP authentication. If given, also `HTTP_USERNAME` must be given.                                                                                         |
| `HTTP_REQUEST_TIMEOUT_IN_SECONDS`     | ❌ No     | `5`           | How long to wait for each HTTP request to finish. Details in the [Got documentation](https://github.com/sindresorhus/got/blob/9022f9643313839eb4b8bb35b0d51a5ea46f679c/documentation/6-timeout.md#request).             |
| `HTTP_SLEEP_DURATION_IN_SECONDS`      | ❌ No     | `0.1`         | How long to wait between processing each HTTP request. This is not the duration between the creation of two successive HTTP requests.                                                                                   |
| `HTTP_URL`                            | ✅ Yes    |               | The URL to poll.                                                                                                                                                                                                        |
| `HTTP_USERNAME_PATH`                  | ❌ No     |               | The path to the file containing the username for the "Basic" HTTP authentication. If given, also `HTTP_PASSWORD` must be given.                                                                                         |
| `HTTP_WARNING_THRESHOLD_IN_SECONDS`   | ❌ No     |               | If the HTTP request takes longer than this in total to finish, log a warning.                                                                                                                                           |
| `LOG_INTERVAL_IN_SECONDS`             | ❌ No     | 60            | How often to inform of successfully sent Pulsar messages.                                                                                                                                                               |
| `PULSAR_BLOCK_IF_QUEUE_FULL`          | ❌ No     | `true`        | Whether the send operations of the producer of the Apache Pulsar client should block when the outgoing message queue is full. If false, send operations will immediately fail when the queue is full.                   |
| `PULSAR_COMPRESSION_TYPE`             | ❌ No     | `ZSTD`        | The compression type to use in the Apache Pulsar topic. Must be one of `Zlib`, `LZ4`, `ZSTD` or `SNAPPY`.                                                                                                               |
| `PULSAR_IS_URL_IN_MESSAGE_PROPERTIES` | ❌ No     | `false`       | Whether to add the polled URL into the properties of the message to be sent to Apache Pulsar. Consider the effect on security if the URL is sensitive.                                                                  |
| `PULSAR_OAUTH2_AUDIENCE`              | ✅ Yes    |               | The OAuth 2.0 audience for the Apache Pulsar cluster.                                                                                                                                                                   |
| `PULSAR_OAUTH2_ISSUER_URL`            | ✅ Yes    |               | The OAuth 2.0 issuer URL for the Apache Pulsar cluster.                                                                                                                                                                 |
| `PULSAR_OAUTH2_KEY_PATH`              | ✅ Yes    |               | The path to the OAuth 2.0 private key JSON file for the Apache Pulsar cluster.                                                                                                                                          |
| `PULSAR_SERVICE_URL`                  | ✅ Yes    |               | The service URL of the Apache Pulsar cluster.                                                                                                                                                                           |
| `PULSAR_TLS_VALIDATE_HOSTNAME`        | ❌ No     | `true`        | Whether to validate the hostname of the Apache Pulsar cluster based on its TLS certificate. This option exists because some Apache Pulsar hosting providers cannot handle Apache Pulsar clients setting this to `true`. |
| `PULSAR_TOPIC`                        | ✅ Yes    |               | The Apache Pulsar topic to send the HTTP bodies to.                                                                                                                                                                     |
