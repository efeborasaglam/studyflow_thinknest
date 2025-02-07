import React, { useState, useEffect } from "react";
import axios from "axios";
import Fullcalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { Modal, Button, Form } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";
import { Link } from "react-router-dom"; // Importiere Link für die Navigation
import "../App.css";

function Calendar() {
  const [events, setEvents] = useState([]);
  const [modalData, setModalData] = useState({
    show: false,
    start: null,
    end: null,
    isEdit: false,
    event: null,
  });
  const [isExam, setIsExam] = useState(false);

  const [showFlames, setShowFlames] = useState(false);

  const triggerFlames = () => {
    setShowFlames(true);
    setTimeout(() => setShowFlames(false), 3000); // Flammen verschwinden nach 3 Sekunden
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const formatDateTime = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
  };

  const fetchEvents = () => {
    axios
      .get("http://localhost:5000/api/events")
      .then((response) => {
        const formattedEvents = response.data.map((event) => ({
          ...event,
          id: event._id.toString(),
          backgroundColor: event.isExam
            ? "red"
            : event.isCompleted
            ? "green"
            : event.backgroundColor || "blue",
        }));
        setEvents(formattedEvents);
      })
      .catch((err) => console.error("Error loading events:", err));
  };

  const handleDateClick = (info) => {
    setModalData({
      show: true,
      start: formatDateTime(info.dateStr),
      end: "",
      isEdit: false,
      event: null,
    });
    setIsExam(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("icsFile", file);

    try {
      await axios.post("http://localhost:5000/api/upload-ics", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      fetchEvents(); // Aktualisieren Sie die Events nach dem Hochladen
    } catch (err) {
      console.error("Error uploading ICS file:", err);
      alert("Failed to upload ICS file.");
    }
  };

  const handleSaveEvent = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const title = formData.get("title");
    const start = formData.get("start");
    let end = formData.get("end");
    const daysBefore = isExam ? parseInt(formData.get("daysBefore"), 10) : 0;
    const studyDuration = isExam ? parseInt(formData.get("studyDuration"), 10) : 0;
    const studyEventColor = formData.get("studyEventColor");
    const eventColor = formData.get("eventColor"); // Farbe für normale Events

    if (!end) {
      end = new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
    }

    const eventData = {
      title,
      start,
      end,
      isExam,
      backgroundColor: eventColor, // Setze die Farbe für normale Events
      studyEventColor,
      ...(isExam ? { importance: parseInt(formData.get("importance"), 10), daysBefore, studyDuration } : {}),
    };

    const axiosMethod = modalData.isEdit ? axios.put : axios.post;
    const url = modalData.isEdit
      ? `http://localhost:5000/api/events/${modalData.event.id}`
      : "http://localhost:5000/api/events";

    axiosMethod(url, eventData)
      .then((response) => {
        fetchEvents();
        handleModalClose();
      })
      .catch((err) => {
        if (err.response && err.response.data && err.response.data.error) {
          alert(err.response.data.error);
        } else {
          console.error("Error saving event:", err);
        }
      });
  };

  const generateStudyEvents = (exam, importance, daysBefore, studyDuration, studyEventColor) => {
    const studyEvents = [];

    let studyInterval;
    if (importance >= 1 && importance <= 20) {
      studyInterval = 3;
    } else if (importance >= 21 && importance <= 50) {
      studyInterval = 2;
    } else {
      studyInterval = 1;
    }

    const examStart = new Date(exam.start);

    axios.get("http://localhost:5000/api/events")
      .then((response) => {
        const existingEvents = response.data.map((event) => ({
          start: new Date(event.start),
          end: new Date(event.end),
        }));

        for (let i = 0; i < daysBefore; i++) {
          let studyEventDate = new Date(examStart);
          studyEventDate.setDate(examStart.getDate() - i);

          if (i % studyInterval === 0) {
            // Berechne verfügbare Zeitslots
            let maxEventsPerDay;
            if (studyDuration <= 15) {
              maxEventsPerDay = 4;
            } else if (studyDuration <= 90) {
              maxEventsPerDay = 2;
            } else {
              maxEventsPerDay = 1;
            }

            // Berechne Zeitslots für den Tag
            const workingHours = 18; // 6:00 bis 23:59
            const timeSlotInterval = Math.floor(workingHours / maxEventsPerDay);
            
            for (let slot = 0; slot < maxEventsPerDay; slot++) {
              const eventStart = new Date(studyEventDate);
              eventStart.setHours(6 + (slot * timeSlotInterval), 0, 0, 0);
              
              // Prüfe ob der Zeitslot verfügbar ist
              const isSlotAvailable = !existingEvents.some(event => {
                const slotEnd = new Date(eventStart.getTime() + studyDuration * 60000);
                return (event.start < slotEnd && event.end > eventStart);
              });

              if (isSlotAvailable) {
                studyEvents.push({
                  title: `Study for ${exam.title}`,
                  start: eventStart.toISOString(),
                  end: new Date(eventStart.getTime() + studyDuration * 60000).toISOString(),
                  backgroundColor: studyEventColor,
                  relatedExamId: exam.id,
                });
              }
            }
          }
        }

        if (studyEvents.length > 0) {
          axios.post("http://localhost:5000/api/events/bulk", studyEvents)
            .then(() => {
              console.log("Study events successfully created.");
              fetchEvents();
            })
            .catch((err) => console.error("Error creating study events:", err));
        }
      })
      .catch((err) => console.error("Error fetching existing events:", err));
  };

  const toggleEventCompletion = (eventId) => {
    axios
      .put(`http://localhost:5000/api/events/toggle-completed/${eventId}`)
      .then(() => {
        fetchEvents(); // Aktualisiere die Event-Daten
        handleModalClose(); // Schließe das Modal
        triggerFlames(); // Flammen starten
      })
      .catch((err) => console.error("Error toggling event completion:", err));
  };

  const handleModalClose = () => {
    setModalData({
      show: false,
      start: null,
      end: null,
      isEdit: false,
      event: null,
    });
    setIsExam(false);
  };

  const handleDeleteEvent = () => {
    if (modalData.event) {
      axios
        .delete(`http://localhost:5000/api/events/${modalData.event.id}`)
        .then(() => {
          if (modalData.event.isExam) {
            axios
              .delete(
                `http://localhost:5000/api/events/related/${modalData.event.id}`
              )
              .then(() => fetchEvents()) // Aktualisiere nach dem Löschen der verwandten Events
              .catch((err) =>
                console.error("Error deleting related events:", err)
              );
          }
          fetchEvents(); // Aktualisiere die Events nach dem Löschen des Haupt-Events
          handleModalClose(); // Schließe das Modal nach dem Löschen
        })
        .catch((err) => console.error("Error deleting event:", err));
    }
  };

  const handleDeleteAllEvents = () => {
    axios
      .delete("http://localhost:5000/api/events")
      .then(() => {
        fetchEvents(); // Aktualisiere die Events nach dem Löschen
      })
      .catch((err) => console.error("Error deleting all events:", err));
  };

  return (
    <div>
      {showFlames && (
        <div className="flames-container">
          <div className="flame flame-1">🔥</div>
          <div className="flame flame-2">🔥</div>
          <div className="flame flame-3">🔥</div>
          <div className="flame flame-4">🔥</div>
          <div className="flame flame-6">🔥</div>
          <div className="flame flame-7">🔥</div>
          <div className="flame flame-8">🔥</div>
          <div className="flame flame-9">🔥</div>
          <div className="flame flame-10">🔥</div>
        </div>
      )}

      <Link to="/">
        <Button variant="secondary">Back to Home</Button>
      </Link>
      <div style={{ marginBottom: "20px" }}>
        <Form.Group>
          <Form.Label>Upload ICS File</Form.Label>
          <Form.Control type="file" accept=".ics" onChange={handleFileUpload} />
        </Form.Group>
      </div>
      <Button variant="danger" onClick={handleDeleteAllEvents}>
        Delete All Events
      </Button>
      <Fullcalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={"dayGridMonth"}
        headerToolbar={{
          start: "today prev,next",
          center: "title",
          end: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        height={"90vh"}
        events={events}
        dateClick={handleDateClick}
        eventClick={(info) => {
          setModalData({
            show: true,
            start: formatDateTime(info.event.start),
            end: formatDateTime(info.event.end),
            isEdit: true,
            event: events.find((event) => event.id === info.event.id),
          });
        }}
        editable={true}
        firstDay={1}
      />
      <Modal show={modalData.show} onHide={handleModalClose}>
        <Form onSubmit={handleSaveEvent}>
          <Modal.Header closeButton>
            <Modal.Title>
              {modalData.isEdit ? "Edit Event" : "Add Event"}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Title</Form.Label>
              <Form.Control
                name="title"
                defaultValue={modalData.isEdit ? modalData.event.title : ""}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Start</Form.Label>
              <Form.Control
                type="datetime-local"
                name="start"
                defaultValue={
                  modalData.isEdit
                    ? formatDateTime(modalData.event.start)
                    : modalData.start
                }
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>End</Form.Label>
              <Form.Control
                type="datetime-local"
                name="end"
                defaultValue={
                  modalData.isEdit ? formatDateTime(modalData.event.end) : ""
                }
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Event Color</Form.Label>
              <Form.Control
                type="color"
                name="eventColor"
                defaultValue={modalData.isEdit ? modalData.event.backgroundColor : "#0000ff"}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                label="Is this an exam?"
                onChange={(e) => setIsExam(e.target.checked)}
              />
            </Form.Group>

            {isExam && (
              <>
                <Form.Group className="mb-3">
                  <Form.Label>Importance (1-100)</Form.Label>
                  <Form.Control
                    type="number"
                    name="importance"
                    min="1"
                    max="100"
                    required
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Days before the exam to study</Form.Label>
                  <Form.Control
                    type="number"
                    name="daysBefore"
                    min="1"
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Study duration (in minutes)</Form.Label>
                  <Form.Control
                    type="number"
                    name="studyDuration"
                    min="15"
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Study Event Color</Form.Label>
                  <Form.Control
                    type="color"
                    name="studyEventColor"
                    defaultValue="#0000ff" 
                  />
                </Form.Group>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            {modalData.event && (
              <Button
                variant={modalData.event.isCompleted ? "warning" : "success"}
                onClick={() => toggleEventCompletion(modalData.event.id)}
              >
                {modalData.event.isCompleted
                  ? "Mark as Incomplete"
                  : "Mark as Completed, Ich schwöre auf Gott das ich es erledigt habe, Vallah!"}
              </Button>
            )}
            <Button variant="danger" onClick={handleDeleteEvent}>
              Delete
            </Button>
            <Button variant="secondary" onClick={handleModalClose}>
              Close
            </Button>
            <Button variant="primary" type="submit">
              Save
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}
export default Calendar;