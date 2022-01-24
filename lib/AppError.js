module.exports = class AppError extends Error {
  constructor (message, title) {
    super()
    this.message = message
    this.title = title;
  }
}
