import React, { useState, useEffect } from "react";
import axios from "axios";
import { Card, ListGroup, Button, Dropdown, DropdownButton } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";
import { Link } from "react-router-dom";
import "../App.css"; // Stelle sicher, dass deine CSS-Datei eingebunden ist

const HomePage = () => {
  const [events, setEvents] = useState([]);
  const [backgroundColor, setBackgroundColor] = useState("#ffffff"); // Standardfarbe Weiß
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    fetchDailyTasks();
  }, []);

  // Dark mode toggle
  useEffect(() => {
    document.body.style.backgroundColor = backgroundColor; // Hintergrundfarbe ändern
    document.body.style.color = isDarkMode ? "#ffffff" : "#000000"; // Textfarbe ändern
  }, [backgroundColor, isDarkMode]);

  const fetchDailyTasks = () => {
    axios
      .get("http://localhost:5000/api/events")
      .then((response) => {
        const today = new Date();
        const filteredEvents = response.data.filter((event) => {
          const eventDate = new Date(event.start);
          return (
            eventDate.getDate() === today.getDate() &&
            eventDate.getMonth() === today.getMonth() &&
            eventDate.getFullYear() === today.getFullYear()
          );
        });
        setEvents(filteredEvents);
      })
      .catch((err) => {
        console.error("Error loading events:", err);
      });
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  };

  // Farbänderungshandler
  const handleColorChange = (color) => {
    setBackgroundColor(color);
  };

  return (
    <div
      style={{
        backgroundColor: backgroundColor,
        color: isDarkMode ? "#ffffff" : "#000000",
        minHeight: "100vh",
        transition: "background-color 0.3s, color 0.3s",
      }}
    >
      <div className="container mt-4">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2>Today's Tasks</h2>
          <div className="d-flex">
            <DropdownButton
              id="dropdown-basic-button"
              title="Change Background Color"
              variant="secondary"
              className="me-2"
            >
              <Dropdown.Item onClick={() => handleColorChange("#ffffff")}>White</Dropdown.Item>
              <Dropdown.Item onClick={() => handleColorChange("#121212")}>Black</Dropdown.Item>
              <Dropdown.Item onClick={() => handleColorChange("#f5f5dc")}>Beige</Dropdown.Item>
              <Dropdown.Item onClick={() => handleColorChange("#add8e6")}>Light Blue</Dropdown.Item>
              <Dropdown.Item onClick={() => handleColorChange("#90ee90")}>Light Green</Dropdown.Item>
            </DropdownButton>
            <Button
              variant="secondary"
              onClick={() => setIsDarkMode(!isDarkMode)}
              style={{
                backgroundColor: isDarkMode ? "#444" : "",
                color: isDarkMode ? "#ffffff" : "",
              }}
            >
              {isDarkMode ? "Light Mode" : "Dark Mode"}
            </Button>
          </div>
        </div>
        <div className="row">
          {events.length === 0 ? (
            <div className="col-12">
              <h4>No tasks for today!</h4>
            </div>
          ) : (
            events.map((event) => (
              <div className="col-md-4 mb-4" key={event.id}>
                <Card
                  style={{
                    backgroundColor: isDarkMode ? "#1e1e1e" : "#ffffff",
                    color: isDarkMode ? "#ffffff" : "#000000",
                  }}
                >
                  <Card.Body>
                    <Card.Title>{event.title}</Card.Title>
                    <ListGroup variant="flush">
                      <ListGroup.Item>
                        <strong>Start: </strong>
                        {formatTime(event.start)}
                      </ListGroup.Item>
                      <ListGroup.Item>
                        <strong>End: </strong>
                        {formatTime(event.end)}
                      </ListGroup.Item>
                      <ListGroup.Item>
                        <strong>Status: </strong>
                        <span
                          style={{
                            color: event.isCompleted ? "green" : "red",
                          }}
                        >
                          {event.isCompleted ? "Completed" : "Pending"}
                        </span>
                      </ListGroup.Item>
                    </ListGroup>
                  </Card.Body>
                </Card>
              </div>
            ))
          )}
        </div>
        <div className="text-center mt-4">
          <Link to="/calendar">
            <Button
              variant="primary"
              style={{
                backgroundColor: isDarkMode ? "#444" : "",
                color: isDarkMode ? "#ffffff" : "",
              }}
            >
              Go to Calendar
            </Button>
          </Link>
          <Link to="/chat">
            <Button
              variant="primary"
              style={{
                backgroundColor: isDarkMode ? "#444" : "",
                color: isDarkMode ? "#ffffff" : "",
              }}
            >
              Go to StudyAI
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
