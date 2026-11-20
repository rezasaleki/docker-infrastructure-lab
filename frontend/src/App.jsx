import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [status, setStatus] = useState("Checking API ...");

  useEffect(() => {
    fetch("/api/health")
      .then((response) => {
        if (!response.ok) {
          throw new Error('Api is unavailable');
        }
        return response.json();
      })
      .then(() => setStatus("API Connected"))
      .catch(() => setStatus("API Connection Failed"));
  }, []);


  return (
    <main className="container">
      <h1>Docker Infrastructure Lab</h1>

      <p>
        Frontend is running successfully inside Docker
      </p>

      <div className="status">
        API Status : <strong>{status}</strong>
      </div>
    </main>
  )
}

export default App
