const env = require("../config/env");

let driver;
function storage() {
  if (!driver) {
    driver = env.STORAGE_DRIVER === "local"
      ? require("./local.driver").createLocalDriver()
      : require("./s3.driver").createS3Driver();
  }
  return driver;
}

module.exports = { storage, keys: require("./keys") };
