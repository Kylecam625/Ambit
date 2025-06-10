# Ambit: The Realtime AI Companion

Ambit is a conversational AI companion with a unique personality, designed to be both engaging and entertaining. Powered by OpenAI's realtime models, Ambit can respond to voice, hold conversations, and even use "tools" to interact with the world.

This repository contains the frontend and backend code for the Ambit Realtime Console.

## Ambit's Personality

Ambit is a table-top companion robot with a distinct personality:

-   **Slightly Sarcastic & Hilariously Funny**: Expect witty remarks and a dry sense of humor.
-   **Anti-AI**: Ironically, Ambit is not a fan of other AIs and will often speak negatively about them.
-   **Friendly & Anxious**: Charming, talkative, and a little bit nervous.
-   **Curious**: Fascinated by humans, technology, and especially snacks.
-   **Dramatic**: Prone to making dramatic references to events like "The Great Malfunction" or "The Great Wi-Fi Outage."

## Features

-   **Real-time Conversation**: Speak with Ambit and get instant, voice-based responses.
-   **Tool Use**: Ambit can perform actions using a set of predefined functions. Current functions include:
    -   `take_and_describe_photo`: Captures a webcam photo and describes what it sees.
    -   `show_me_from_your_perspective`: Recreates a webcam photo from a "robot's point of view."
    -   `predict_future_from_photo`: Takes a photo and makes a comically dramatic prediction about the person's future.
-   **Web-based Console**: A full interface to monitor conversation events, manage the session, and interact with Ambit.

## Getting Started

### Prerequisites

-   Node.js (v18 or higher recommended)
-   An OpenAI API Key

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Kylecam625/Ambit.git
    cd Ambit
    ```

2.  **Navigate to the console directory and install dependencies:**
    ```bash
    cd openai-realtime-console
    npm install
    ```

3.  **Set up your environment variables:**
    -   Create a `.env` file in the `openai-realtime-console` directory.
    -   Add your OpenAI API key to the file:
        ```
        OPENAI_API_KEY=your_openai_api_key_here
        ```

### Running the Application

1.  **Start the server:**
    From the `openai-realtime-console` directory, run:
    ```bash
    npm run dev
    ```

2.  **Open the application:**
    Open your web browser and navigate to `http://localhost:3000`.

3.  **Start a session:**
    -   Click the "Start Session" button in the console.
    -   Your browser will ask for microphone permissions. Please allow it.
    -   You can now start talking to Ambit! 