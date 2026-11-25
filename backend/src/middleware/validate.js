// Validates req.body, req.query or req.params against a zod schema and replaces them with parsed values.
function validate(schema, source = "body") {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req[source] ?? {});
      req[source] = parsed;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { validate };
