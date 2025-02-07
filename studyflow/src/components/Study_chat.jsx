import { useState } from "react";
import { Modal, Button, Form } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";
import "./study_chat.css";
import { Link } from "react-router-dom";


function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;

    setMessages((prev) => [...prev, { text: input, sender: "user" }]);
    setIsLoading(true);
    setMessages((prev) => [...prev, { text: "", sender: "bot", isLoading: true }]);

    try {
      const response = await fetch("http://localhost:5000/chat", { // Updated port to 5000
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });

      const data = await response.json();
      const formattedReply = data.reply
        .replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>')
        .replace(/\n/g, '<br />');
      
      typeEffect(formattedReply);
    } catch (error) {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { text: "Fehler: " + error.message, sender: "bot" },
      ]);
    }
    setIsLoading(false);
    setInput("");
  };

  const typeEffect = (text) => {
    let i = 0;
    setMessages((prev) => {
      let newMessages = [...prev];
      newMessages[newMessages.length - 1] = { text: "", sender: "bot", isLoading: false };
      return newMessages;
    });
  
    const interval = setInterval(() => {
      setMessages((prev) => {
        if (i >= text.length) {
          clearInterval(interval);
          return prev;
        }
  
        let newMessages = [...prev];
        let lastMessage = newMessages[newMessages.length - 1];
  
        if (!lastMessage.text) {
          lastMessage.text = ""; 
        }
  
        lastMessage.text += text.charAt(i);
        newMessages[newMessages.length - 1] = lastMessage;
        i++;
  
        return newMessages;
      });
    }, 20); // Schnellerer Typing-Effekt (statt 50ms jetzt 20ms)
  };
  
  
  return (
    <div className="row" style={{ backgroundColor: "#00407C" }}>
      <div className="border border-primary p-4">
        <center>
          <h2 className="mb-5 mt-1">StudyChat</h2>
        </center>
        <center>
          <div className="container d-flex justify-content-center">
            <div className="chat-box-container d-none d-lg-block ">
              <div className="bg-light p-3 rounded shadow chat-box">
                {messages.map((msg, index) => (
                  <div key={index} className={`message ${msg.sender}`}>
                    {msg.sender === "user" ? "You: " : "StudyAI: "}
                    <span dangerouslySetInnerHTML={{ __html: msg.text }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </center>
        <div className="input-box mt-5" style={{ marginBottom: "20px" }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
          />
          <button type="button" className="btn btn-primary" onClick={sendMessage}>Send</button>
          <Link to="/">
            <Button
              variant="primary"
            >
              Go to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default App;
