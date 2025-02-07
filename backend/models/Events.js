const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  backgroundColor: { type: String, default: "blue" },
  isCompleted: { type: Boolean, default: false },
  isExam: { type: Boolean, default: false },
  importance: { type: Number, default: 50, min: 1, max: 100 },
  relatedExamId: { type: mongoose.Schema.Types.ObjectId, ref: "Event" },
});

// Indexe für schnelle Abfragen nach Start- und Endzeit
eventSchema.index({ start: 1, end: 1 });

module.exports = mongoose.model('Event', eventSchema);
