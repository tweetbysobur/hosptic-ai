const { badRequest } = require("../utils/errors");

// Validates and replaces req[part] with the parsed value.
const validate = (schema, part = "body") => (req, res, next) => {
  const result = schema.safeParse(req[part] ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return next(badRequest("Invalid request", details));
  }
  if (part === "query") req.validatedQuery = result.data;
  else req[part] = result.data;
  next();
};

module.exports = { validate };
