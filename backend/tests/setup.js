const path = require("path");
// Test values take precedence over .env. dotenv does not override variables already set.
require("dotenv").config({ path: path.resolve(__dirname, "test.env"), quiet: true });
process.env.TF_CPP_MIN_LOG_LEVEL = "3";
