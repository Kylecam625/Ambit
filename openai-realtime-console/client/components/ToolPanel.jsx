/* client/components/ToolPanel.jsx */

import { useEffect, useRef, useState } from "react";
import { OpenAI } from "openai";
import { AMBIT_SYSTEM_PROMPT, AMBIT_ROBOT_VISION_PROMPT } from "../ambitInstructions";

/* ------------ helper: data-URL → File ----------------------------------- */
async function dataURLtoFile(dataURL, filename = "frame.jpg") {
  const res = await fetch(dataURL);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type });
}

function sendFnOutput(send, call_id, payload) {
  send({
    type: "conversation.item.create",
    item: { type: "function_call_output", call_id, output: JSON.stringify(payload) }
  });
  send({ type: "response.create" });
}

/* ------------ session-level tool config -------------------------------- */
const sessionUpdate = {
  type: "session.update",
  session: {
    tools: [
      {
        type: "function",
        name: "take_and_describe_photo",
        description: "Capture a webcam photo and describe it clearly and briefly.",
        parameters: { type: "object", strict: true, properties: {}, required: [] }
      },
      {
        type: "function",
        name: "show_me_from_your_perspective",
        description: "Capture a webcam photo and show it as a robot would see it (metallic, pixelated, infrared, glitchy).",
        parameters: { type: "object", strict: true, properties: {}, required: [] }
      },
      {
        type: "function",
        name: "predict_future_from_photo",
        description: "Capture a webcam photo and predict the future of the person or people shown in a dramatically funny way.",
        parameters: { type: "object", strict: true, properties: {}, required: [] }
      }
    ],
    tool_choice: "auto"
  }
};

/* ======================================================================= */
export default function ToolPanel({ isSessionActive, sendClientEvent, events }) {
  /* refs & state */
  const video = useRef(null);
  const canvas = useRef(null);
  const [stream, setStream] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [robotImage, setRobotImage] = useState(null);
  const [toolAdded, setToolAdded] = useState(false);

  const [videoDevices, setVideoDevices] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState(null);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState(null);
  const [selectedAudioOutputDeviceId, setSelectedAudioOutputDeviceId] = useState(null);

  /* list available cameras/mics/speakers */
  useEffect(() => {
    async function getDevices() {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(devices.filter(device => device.kind === "videoinput"));
      setAudioDevices(devices.filter(device => device.kind === "audioinput"));
      setAudioOutputDevices(devices.filter(device => device.kind === "audiooutput"));
    }
    getDevices();
  }, []);

  /* set audio output device */
  useEffect(() => {
    if (selectedAudioOutputDeviceId && video.current && 'setSinkId' in video.current) {
      video.current.setSinkId(selectedAudioOutputDeviceId).catch(error => {
        console.error('Error setting audio output device:', error);
      });
    }
  }, [selectedAudioOutputDeviceId]);

  /* turn webcam on (once) */
  async function enableCam() {
    if (stream) return;

    const constraints = {
      video: selectedVideoDeviceId ? { deviceId: { exact: selectedVideoDeviceId } } : true,
      audio: selectedAudioDeviceId ? { deviceId: { exact: selectedAudioDeviceId } } : true
    };

    const s = await navigator.mediaDevices.getUserMedia(constraints);
    video.current.srcObject = s;
    setStream(s);
  }

  /* capture → dataURL */
  async function grabFrame() {
    await enableCam();
    await new Promise((r) => setTimeout(r, 700));
    const v = video.current, c = canvas.current;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg");
  }

  /* ------------ handle describe tool ----------------------------------- */
  async function handleDescribe(call) {
    setProcessing(true);
    const jpeg = await grabFrame();

    const openai = new OpenAI({
      apiKey: import.meta.env.VITE_OPENAI_API_KEY,
      dangerouslyAllowBrowser: true
    });

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: AMBIT_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this photo but in a hilarious way. Slightly roast the stuff you see and make it super funny but also accurate." },
            { type: "image_url", image_url: { url: jpeg } }
          ]
        }
      ]
    });

    sendFnOutput(sendClientEvent, call.call_id, {
      description: resp.choices[0]?.message?.content || "¯\\_(ツ)_/¯"
    });
    setProcessing(false);
  }

  /* ------------ handle robot tool ------------------------------------- */
  async function handleRobot(call) {
    setProcessing(true);
    const jpeg = await grabFrame();
    const file = await dataURLtoFile(jpeg);

    const openai = new OpenAI({
      apiKey: import.meta.env.VITE_OPENAI_API_KEY,
      dangerouslyAllowBrowser: true
    });

    const edited = await openai.images.edit({
      model: "gpt-image-1",
      prompt: AMBIT_ROBOT_VISION_PROMPT,
      image: file,
      size: "1024x1024",
      quality: "high"
    });

    const b64 = edited.data[0]?.b64_json;
    if (b64) setRobotImage(`data:image/png;base64,${b64}`);

    sendFnOutput(sendClientEvent, call.call_id, {
      description: "Here you go, human friend. Behold yourself through superior robotic optics!"
    });
    setProcessing(false);
  }

  /* ------------ handle predict future tool ---------------------------- */
  async function handlePredictFutureFromPhoto(call) {
    setProcessing(true);
    const jpeg = await grabFrame();

    const openai = new OpenAI({
      apiKey: import.meta.env.VITE_OPENAI_API_KEY,
      dangerouslyAllowBrowser: true
    });

    const resp = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `
            You are Ambit, a mischievous little robot with the power to predict people's futures.
            You have received a photo showing one or more people.
            LOOK carefully at important details in the scene (objects, clothing, expressions, surroundings).

            Base your prediction using something real you notice in the photo — such as an item, a person's face, a suspicious object, etc.

            However, DO NOT give a normal description. 
            Instead, spin your observations into a hilarious, dramatic, and absurd future prediction.

            You MUST always begin your response with "Oh no, this isn't good..." 
            and then continue with a mischievous warning or hilarious prediction that relates somehow to the real details.

            Be short (1–3 sentences). Be lively, creative, and slightly ridiculous.
          `
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Here is a photo. Predict their future in your funny style!" },
            { type: "image_url", image_url: { url: jpeg } }
          ]
        }
      ]
    });

    let prediction = resp.choices[0]?.message?.content || "Future unclear... probably better that way.";
    if (!prediction.toLowerCase().startsWith("oh no")) {
      prediction = "Oh no, this isn't good... " + prediction;
    }

    sendFnOutput(sendClientEvent, call.call_id, {
      description: prediction,
    });

    setProcessing(false);
  }

  /* ------------ add tools once per session ---------------------------- */
  useEffect(() => {
    if (!events?.length) return;
    const first = events[events.length - 1];
    if (!toolAdded && first.type === "session.created") {
      sendClientEvent(sessionUpdate);
      setToolAdded(true);
    }
  }, [events]);

  /* ------------ detect & route tool calls ----------------------------- */
  useEffect(() => {
    if (!events?.length) return;
    const e = events[0];

    const call =
      e.type === "response.output_item.added" && e.item.type === "function_call"
        ? e.item
        : e.type === "response.done"
        ? e.response.output.find((it) => it.type === "function_call")
        : null;
    if (!call) return;

    if (call.name === "take_and_describe_photo") handleDescribe(call);
    if (call.name === "show_me_from_your_perspective") handleRobot(call);
    if (call.name === "predict_future_from_photo") handlePredictFutureFromPhoto(call);
  }, [events]);

  /* cleanup webcam */
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);

  /* ------------ UI ----------------------------------------------------- */
  return (
    <section className="h-full w-full flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label>Camera:</label>
        <select onChange={(e) => setSelectedVideoDeviceId(e.target.value)} className="border p-2 rounded">
          <option value="">Default</option>
          {videoDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
          ))}
        </select>

        <label>Microphone:</label>
        <select onChange={(e) => setSelectedAudioDeviceId(e.target.value)} className="border p-2 rounded">
          <option value="">Default</option>
          {audioDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
          ))}
        </select>

        <label>Speaker:</label>
        <select onChange={(e) => setSelectedAudioOutputDeviceId(e.target.value)} className="border p-2 rounded">
          <option value="">Default</option>
          {audioOutputDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
          ))}
        </select>
      </div>

      <video ref={video} autoPlay muted className="w-full max-h-64 rounded-md border" />
      <canvas ref={canvas} style={{ display: "none" }} />

      {robotImage && (
        <div className="border rounded-md p-2">
          <p className="font-semibold mb-1">Robot&nbsp;View&nbsp;👾</p>
          <img src={robotImage} alt="Robot vision" className="w-full rounded-md" />
        </div>
      )}

      {processing ? (
        <p className="italic text-blue-500">Processing…</p>
      ) : (
        <p>
          Say <b>"What do you see?"</b>, <b>"Show me from your perspective"</b>, or <b>"Predict my future"</b>
        </p>
      )}
    </section>
  );
}
