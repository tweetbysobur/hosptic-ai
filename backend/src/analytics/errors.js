// Thrown when an analysis cannot be run validly. The message is safe to show to the user.
class AnalysisError extends Error {
  constructor(message) {
    super(message);
    this.name = "AnalysisError";
    this.status = 422;
  }
}
module.exports = { AnalysisError };
