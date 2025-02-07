const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const multer = require("multer");
const ical = require("node-ical");
const fs = require("fs");
const dotenv = require("dotenv");
const { GoogleGenerativeAI } = require("@google/generative-ai");

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const upload = multer({ dest: "uploads/" });

const mongoURI = process.env.MONGO_URI;

mongoose
  .connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

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

const Event = mongoose.model("Event", eventSchema);

app.get("/api/events", (req, res) => {
  Event.find()
    .sort({ start: 1 }) // Sortiere Events nach Startzeitpunkt
    .then((events) => res.json(events))
    .catch((err) => res.status(500).json({ error: "Failed to fetch events" }));
});

// POST-Endpunkt zum Erstellen eines Events
app.post("/api/events", async (req, res) => {
  try {
    const { start, end, isExam, studyDuration, studyEventColor, daysBefore, importance, backgroundColor } = req.body;

    // Wenn kein Endzeitpunkt angegeben ist, füge 1 Stunde zum Startzeitpunkt hinzu
    let eventEnd = end;
    if (!eventEnd) {
      eventEnd = new Date(
        new Date(start).getTime() + 60 * 60 * 1000
      ).toISOString(); // 1 Stunde nach Start
    }

    // Überprüfen, ob ein Event oder eine Prüfung bereits im gleichen Zeitraum existiert
    const conflictingEvent = await Event.findOne({
      $or: [
        { start: { $lte: eventEnd }, end: { $gte: start } }, // Start- und Endzeitraum überprüfen
      ],
    });

    if (conflictingEvent) {
      return res
        .status(400)
        .json({
          error:
            "Es gibt bereits ein Event oder eine Prüfung zur gleichen Zeit.",
        });
    }

    const newEvent = new Event({
      ...req.body,
      backgroundColor: backgroundColor || "blue", // Setze die Farbe für normale Events
    });
    await newEvent.save();

    // Wenn es sich um eine Prüfung handelt, erstelle die Study-Events
    if (isExam) {
      const examStart = new Date(newEvent.start);
      const studyInterval = importance <= 20 ? 3 : importance <= 50 ? 2 : 1; // Intervall basierend auf Wichtigkeit

      for (let i = 0; i < daysBefore; i += studyInterval) {
        let studyEventStart = new Date(examStart);
        studyEventStart.setDate(examStart.getDate() - i); // Tage vor der Prüfung
        studyEventStart.setHours(6, 0, 0, 0); // Setze den Startzeitpunkt auf 6 Uhr morgens

        let numberOfEvents;

        // Bestimme die Anzahl der Events basierend auf der Study-Dauer
        if (studyDuration < 30) {
          numberOfEvents = 4; // 4 Termine pro Tag
        } else if (studyDuration >= 30 && studyDuration < 60) {
          numberOfEvents = Math.random() < 0.5 ? 2 : 3; // 2 oder 3 Termine pro Tag
        } else {
          numberOfEvents = 2; // 2 Termine pro Tag
        }

        for (let j = 0; j < numberOfEvents; j++) {
          // Finde den nächsten verfügbaren Slot für das Study-Event
          const { start, end } = await findNextAvailableSlot(
            studyEventStart.toISOString(),
            studyDuration, // Verwende die tatsächliche Study-Dauer
            newEvent._id // Setze die relatedExamId
          );

          // Überprüfe, ob der Startzeitpunkt nach 5:59 Uhr liegt
          if (studyEventStart.getHours() < 6) {
            studyEventStart.setHours(6, 0, 0, 0); // Setze den Startzeitpunkt auf 6 Uhr morgens
          }

          await Event.create({
            title: `Study for ${newEvent.title}`,
            start,
            end,
            backgroundColor: studyEventColor || "blue", // Verwende die korrekte Farbe
            relatedExamId: newEvent._id, // Setze die relatedExamId
          });

          // Erhöhe den Startzeitpunkt für das nächste Event um die Study-Dauer
          studyEventStart.setMinutes(studyEventStart.getMinutes() + studyDuration);
        }
      }
    }

    res.status(201).json(newEvent);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating event");
  }
});

// Hilfsfunktion: Nächsten freien Zeitraum finden (für Study-Events und normale Events)
async function findNextAvailableSlot(start, durationInMinutes, ignoreEventId = null) {
  let proposedStart = new Date(start); // Startzeitpunkt für den neuen Slot
  let proposedEnd = new Date(
    proposedStart.getTime() + durationInMinutes * 60000
  );

  while (true) {
    // Finde ein Event, das im Konflikt mit dem vorgeschlagenen Zeitraum steht
    const conflictingEvent = await Event.findOne({
      _id: { $ne: ignoreEventId }, // Ignoriere das aktuelle Event bei der Kollisionserkennung
      $or: [
        {
          start: { $lt: proposedEnd.toISOString() },
          end: { $gt: proposedStart.toISOString() },
        },
      ],
    }).sort({ end: 1 }); // Das früheste Konfliktende finden

    if (!conflictingEvent) {
      // Kein Konflikt gefunden, Slot ist frei
      return {
        start: proposedStart.toISOString(),
        end: proposedEnd.toISOString(),
      };
    }

    // Konflikt besteht - neuen Startzeitpunkt nach dem Ende des Konflikts setzen
    proposedStart = new Date(conflictingEvent.end);
    proposedStart.setMinutes(proposedStart.getMinutes() + 1); // Eine Minute Pufferzeit
    proposedEnd = new Date(proposedStart.getTime() + durationInMinutes * 60000);
  }
}

// PUT-Endpunkt zum Bearbeiten eines Events
app.put("/api/events/:id", async (req, res) => {
  try {
    const eventId = req.params.id;
    const updatedEvent = req.body;

    // Wenn kein Endzeitpunkt angegeben, setze einen Standard-Endzeitpunkt (1 Stunde nach Start)
    if (!updatedEvent.end) {
      updatedEvent.end = new Date(
        new Date(updatedEvent.start).getTime() + 60 * 60 * 1000
      ).toISOString(); // Standard 1 Stunde
    }

    // Überprüfe auf Konflikte
    const conflictingEvent = await Event.findOne({
      _id: { $ne: eventId },
      $or: [
        {
          start: { $lte: updatedEvent.end },
          end: { $gte: updatedEvent.start },
        },
      ],
    });
    if (conflictingEvent) {
      return res
        .status(400)
        .json({ error: "Zeitkonflikt mit einem anderen Termin." });
    }

    // Finde das bestehende Event
    const event = await Event.findById(eventId);
    
    // Lösche die bestehenden Study Events, wenn es sich um eine Prüfung handelt
    if (event && event.isExam) {
      await Event.deleteMany({ relatedExamId: eventId });
    }

    // Aktualisiere das Event
    const updated = await Event.findByIdAndUpdate(eventId, updatedEvent, {
      new: true,
    });

    // Wenn es sich um eine Prüfung handelt, erstelle neue Study Events
    if (updated.isExam) {
      const studyDuration = req.body.studyDuration || 60; // Minuten
      const daysBefore = req.body.daysBefore || 7;
      const importance = req.body.importance || 50; 
      const examStart = new Date(updated.start);
      const studyInterval = importance <= 20 ? 3 : importance <= 50 ? 2 : 1; // Intervall basierend auf Wichtigkeit

      for (let i = 0; i < daysBefore; i += studyInterval) {
        let studyEventStart = new Date(examStart);
        studyEventStart.setDate(examStart.getDate() - i); // Tage vor der Prüfung
        studyEventStart.setHours(9, 0, 0, 0); 
        const { start, end } = await findNextAvailableSlot(
          studyEventStart.toISOString(),
          studyDuration,
          updated._id
        );
        await Event.create({
          title: `Study for ${updated.title}`,
          start,
          end,
          backgroundColor: "blue",
          relatedExamId: updated._id,
        });
      }
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).send("Fehler beim Aktualisieren des Termins.");
  }
});

// Toggle event completion
app.put("/api/events/toggle-completed/:id", async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Toggle the isCompleted property
    event.isCompleted = !event.isCompleted;
    await event.save();

    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error toggling event completion");
  }
});

// DELETE-Endpunkt zum Löschen einer Prüfung und der zugehörigen Lernevents
app.delete("/api/events/:id", async (req, res) => {
  try {
    const eventId = req.params.id;
    const event = await Event.findById(eventId);
    
    // Wenn das Event eine Prüfung ist, lösche die zugehörigen Study Events
    if (event && event.isExam) {
      const deletedStudyEvents = await Event.deleteMany({ relatedExamId: eventId });
      console.log(`Deleted study events: ${deletedStudyEvents.deletedCount}`);
    }
    
    // Lösche das Event selbst
    await Event.findByIdAndDelete(eventId);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).send("Fehler beim Löschen des Termins.");
  }
});

// DELETE-Endpunkt zum Löschen aller Events
app.delete("/api/events", async (req, res) => {
  try {
    await Event.deleteMany({});
    res.status(204).send();
  } catch (err) {
    console.error("Fehler beim Löschen aller Termine:", err);
    res.status(500).send("Fehler beim Löschen aller Termine.");
  }
});

// ICS-Datei hochladen und Events erstellen
app.post("/api/upload-ics", upload.single("icsFile"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const parsedData = ical.parseICS(fileContent);

    const events = Object.values(parsedData)
      .filter((item) => item.type === "VEVENT")
      .map((event) => ({
        title: event.summary || "Untitled Event",
        start: event.start.toISOString(),
        end: event.end ? event.end.toISOString() : null,
        backgroundColor: "blue",
        isCompleted: false,
      }));

    await Event.insertMany(events);
    fs.unlinkSync(filePath); // Lösche die Datei nach dem Verarbeiten
    res.status(201).send("ICS file processed and events added");
  } catch (err) {
    console.error("Error processing ICS file:", err);
    res.status(500).send("Error processing ICS file");
  }
});

// Chat functionality
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function fetchWithRetry(fetchFunction, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchFunction();
    } catch (error) {
      if (i === retries - 1 || error.status !== 503) throw error;
      console.log(`Retrying in ${delay / 1000} seconds...`);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
}

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) throw new Error("Kein Nachrichteninhalt");

    const chat = model.startChat({ history: [], generationConfig: { maxOutputTokens: 500 } });

    const result = await fetchWithRetry(() => chat.sendMessageStream(message));
    let responseText = "";
    for await (const chunk of result.stream) {
      responseText += await chunk.text();
    }

    res.json({ reply: responseText });
  } catch (error) {
    console.error("Fehler im API-Backend:", error);
    res.status(500).json({ reply: "Tut mir leid, es gab ein Problem mit der AI. Bitte versuche es später erneut." });
  }
});

// Server starten
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
