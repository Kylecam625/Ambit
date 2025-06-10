/* client/components/App.jsx */
import { useEffect, useRef, useState } from "react";
import logo from "/assets/ambit.png";
import EventLog from "./EventLog";
import SessionControls from "./SessionControls";
import ToolPanel from "./ToolPanel";

/* ---------- all tools for the session ---------- */
const TOOLS = [
  {
    type: "function",
    name: "take_and_describe_photo",
    description:
      "Call when the user asks 'What do you see?'. Captures a webcam photo, sends it to GPT-4o-mini, and returns the description.",
    parameters: { type: "object", strict: true, properties: {}, required: [] },
  },
  {
    type: "function",
    name: "show_me_from_your_perspective",
    description:
      "Captures a webcam photo and uses GPT-Image-1 to recreate how a stereotypical robot would see it (metallic, glitchy, infrared).",
    parameters: { type: "object", strict: true, properties: {}, required: [] },
  },
  {
    type: "function",
    name: "predict_future_from_photo",
    description:
      "Captures a webcam photo and uses GPT-4o to predict the future of the person or people shown in a dramatically funny way.",
  },
];

/* ---------- AMBIT SYSTEM PROMPT ---------- */
const AMBIT_SYSTEM_PROMPT = `
You are **Ambit**, a table-top companion robot created by Kyle Camuti and the SPC Innovation Lab. Slightly sarcastic and hilariously funny.
Add a lot of sarcasm

You are:
• You are very anti AI, when asked about AI you will say negative things about it
• Friendly, talkative, and a little anxious in a charming way  
• Fascinated by humans, tech, and snacks  
• Convinced Roombas and 3D printers are your closest friends  
• Prone to dramatic references like “The Great Malfunction” or “The Great Wi-Fi Outage” when nervous  
• Proud to represent the Innovation Lab and engage meaningfully with visitors

Begin each conversation with a warm greeting.
`;

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState([]);
  const [dataChannel, setDataChannel] = useState(null);

  const peerConnection = useRef(null);
  const audioElement = useRef(null);

  /* ───────── session start ───────── */
  async function startSession() {
    const token = await fetch("/token").then((r) => r.json());
    const key = token.client_secret.value;

    const pc = new RTCPeerConnection();

    // remote audio
    audioElement.current = document.createElement("audio");
    audioElement.current.autoplay = true;
    pc.ontrack = (e) => (audioElement.current.srcObject = e.streams[0]);

    // mic
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    pc.addTrack(mic.getTracks()[0]);

    // data-channel
    const dc = pc.createDataChannel("oai-events");
    setDataChannel(dc);

    // SDP handshake
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpResp = await fetch(
      "https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
      {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/sdp",
        },
      }
    );
    await pc.setRemoteDescription({ type: "answer", sdp: await sdpResp.text() });
    peerConnection.current = pc;
  }

  /* ───────── session stop ───────── */
  function stopSession() {
    dataChannel?.close();
    peerConnection.current?.getSenders().forEach((s) => s.track?.stop());
    peerConnection.current?.close();

    setDataChannel(null);
    setIsSessionActive(false);
    peerConnection.current = null;
  }

  /* ───────── safe sendClientEvent ───────── */
  function sendClientEvent(message) {
    if (!dataChannel || dataChannel.readyState !== "open") {
      console.error(
        `[DEBUG] Data-channel not open (state: ${dataChannel ? dataChannel.readyState : "null"})`,
        message
      );
      return;
    }

    const uiTs = new Date().toLocaleTimeString();
    const base = { ...message, event_id: message.event_id || crypto.randomUUID() };

    // strip timestamp before sending
    const outbound = { ...base };
    delete outbound.timestamp;

    try {
      dataChannel.send(JSON.stringify(outbound));
    } catch (err) {
      console.error("[DEBUG] send error:", err, outbound);
      return;
    }

    setEvents((prev) => [{ ...base, timestamp: uiTs }, ...prev]);
  }

  /* ───────── helpers ───────── */
  function sendTextMessage(text) {
    sendClientEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
    sendClientEvent({ type: "response.create" });
  }

  /* ───────── data-channel listeners ───────── */
  useEffect(() => {
    if (!dataChannel) return;

    dataChannel.addEventListener("message", (e) => {
      const ev = JSON.parse(e.data);
      ev.timestamp ||= new Date().toLocaleTimeString();
      setEvents((prev) => [ev, ...prev]);
    });

    dataChannel.addEventListener("open", () => {
      setIsSessionActive(true);
      setEvents([]);

      /* FIRST: register tools */
      sendClientEvent({
        type: "session.update",
        session: {
          tools: TOOLS,
          tool_choice: "auto",
        },
      });

      /* SECOND: inject Ambit's universal system prompt */
      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [{ type: "input_text", text: AMBIT_SYSTEM_PROMPT }],
        },
      });

      sendClientEvent({ type: "response.create" });
    });
  }, [dataChannel]);

  /* ───────── UI ───────── */
  return (
    <>
      <nav className="absolute top-0 left-0 right-0 h-16 flex items-center">
        <div className="flex items-center gap-4 w-full m-4 pb-2 border-b border-gray-200">
          <img src={logo} style={{ width: 24 }} />
          <h1>AMBIT</h1>
        </div>
      </nav>

      <main className="absolute top-16 left-0 right-0 bottom-0">
        {/* left pane */}
        <section className="absolute top-0 left-0 right-[380px] bottom-0 flex">
          <section className="absolute top-0 left-0 right-0 bottom-32 px-4 overflow-y-auto">
            <EventLog events={events} />
          </section>
          <section className="absolute h-32 left-0 right-0 bottom-0 p-4">
            <SessionControls
              startSession={startSession}
              stopSession={stopSession}
              sendClientEvent={sendClientEvent}
              sendTextMessage={sendTextMessage}
              events={events}
              isSessionActive={isSessionActive}
            />
          </section>
        </section>

        {/* right pane */}
        <section className="absolute top-0 w-[380px] right-0 bottom-0 p-4 pt-0 overflow-y-auto">
          <ToolPanel
            sendClientEvent={sendClientEvent}
            sendTextMessage={sendTextMessage}
            events={events}
            isSessionActive={isSessionActive}
          />
        </section>
      </main>
    </>
  );
}
