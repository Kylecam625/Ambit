# 🤖 Ambit AI - Advanced Voice Assistant

Next-generation AI assistant with professional WebRTC audio, multiple voice personas, and customizable behavior.

## ✨ What's New

### 🎨 Enhanced Audio Visualizer
- **Interactive real-time waveform** with smooth animations
- **Professional gradient effects** that respond to voice activity
- **Visual feedback indicators** for speaking, processing, and AI responses
- **Refined UI elements** with modern glassmorphism design

### 🎤 Multiple Voice Personas
Choose from 8 unique AI voices:
- **Kyle (Default)** - Natural, conversational voice
- **Deep Monster** - Dark and intimidating presence
- **Mad Scientist** - Eccentric and brilliant personality  
- **Anxious Nerd** - Nervous but highly intelligent
- **Cowboy** - Rugged Western charm
- **Old Wizard** - Wise and mystical sage
- **Anon** - Anonymous, neutral voice
- **Funny Nerd** - Quirky and humorous character
- **Custom Voice** - Use your own ElevenLabs voice ID

### 🛠️ Advanced Configuration
- **Custom AI Instructions** - Personalize Ambit's behavior and responses
- **API Key Override** - Use your own OpenAI/ElevenLabs keys
- **Persistent Settings** - All preferences saved locally
- **Real-time Configuration** - Changes apply instantly

## 🚀 Features

- **🌐 Modern Web Interface** - Beautiful, responsive design with enhanced UI elements
- **🎤 Professional Audio** - WebRTC echo cancellation, noise suppression, and auto gain control
- **🔊 Real-time Voice** - Enhanced audio visualization with interactive feedback
- **👥 Multiple Personas** - 8 unique voice characters plus custom voice support
- **📝 Custom Instructions** - Tailor AI behavior to your specific needs
- **⚙️ Advanced Settings** - Full control over AI parameters and API keys
- **💾 Local Storage** - Settings persist between sessions
- **📱 Cross-Platform** - Works on any device with a modern browser
- **🚀 Zero Installation** - No complex dependencies or environment issues

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your API keys:
# OPENAI_API_KEY=your_openai_key_here
# ELEVENLABS_API_KEY=your_elevenlabs_key_here
# ELEVENLABS_VOICE_ID=your_voice_id_here
```

### 3. Start the Backend
```bash
python ambit_backend.py
```

### 4. Open the Web Interface
Open `ambit_web_gui.html` in your browser.

## 🎤 Using Voice Features

1. **Connect** - Click "Start Conversation"
2. **Grant Permission** - Allow microphone access when prompted
3. **Choose Voice** - Select from preset voices or use custom voice ID
4. **Customize** - Add custom instructions to modify behavior
5. **Talk** - Speak naturally with professional echo cancellation

## 🔧 Configuration Options

### Voice Settings
- **Preset Voices** - Choose from 8 unique character voices
- **Custom Voice ID** - Use any ElevenLabs voice ID
- **Voice Preview** - Each voice includes personality description

### Advanced Settings
- **Custom Instructions** - Add specific behavior modifications
  - Example: "Always respond in a cheerful tone"
  - Example: "Focus on technical details when explaining"
- **API Key Override** - Use personal API keys instead of defaults
- **Max Tokens** - Control response length (50-500 tokens)

## 🛠️ Architecture

### Core Components

- **`ambit_web_gui.html`** - Enhanced web interface with interactive visualizer
- **`ambit_backend.py`** - Unified WebSocket server with AI integration
- **`ambit_instructions.py`** - Base AI personality and behavior
- **`style.css`** - Modern styling with glassmorphism effects

### Enhanced Audio Pipeline

```
Browser Microphone → WebRTC AEC → Enhanced Visualizer → WebSocket → 
→ Python Backend → Custom Instructions → OpenAI → Selected Voice → 
→ ElevenLabs → Browser Audio with Visual Feedback
```

### Voice Processing Flow

1. **Input Capture** - WebRTC captures audio with echo cancellation
2. **Visual Feedback** - Real-time waveform shows audio levels
3. **VAD Processing** - Silero VAD detects speech segments
4. **Transcription** - Audio converted to text in real-time
5. **AI Processing** - OpenAI processes with custom instructions
6. **Voice Synthesis** - ElevenLabs generates with selected voice
7. **Playback** - Audio plays with synchronized visual feedback

## 🎨 UI Enhancements

- **Glassmorphism Design** - Modern frosted glass effects
- **Smooth Animations** - 60fps visualizer with gradient effects
- **Responsive Layout** - Adapts to any screen size
- **Visual States** - Different colors for listening/processing/speaking
- **Interactive Elements** - Hover effects and smooth transitions

## 🌟 Why Ambit AI?

| Traditional Assistants | Ambit AI |
|-------------------|---------------|
| ❌ Single voice option | ✅ 8+ voice personas |
| ❌ Fixed personality | ✅ Custom instructions |
| ❌ Basic interface | ✅ Interactive visualizer |
| ❌ Limited configuration | ✅ Full control |
| ❌ Echo issues | ✅ Professional WebRTC |

## 🔍 Troubleshooting

### Connection Issues
- Ensure backend is running on port 8765
- Check WebSocket connection in browser console
- Verify API keys in `.env` file

### Audio Issues
- Allow microphone permissions in browser
- Check browser WebRTC support (Chrome/Edge recommended)
- Verify audio input device in system settings

### Voice Issues
- Confirm ElevenLabs API key is valid
- Check voice ID is correct
- Ensure sufficient API credits

## 📁 Project Structure

```
AmbitChad/
├── ambit_web_gui.html      # Enhanced web interface
├── ambit_backend.py        # Unified backend server
├── ambit_instructions.py   # AI personality base
├── style.css              # Modern UI styling
├── requirements.txt       # Python dependencies
├── .env.example          # Environment template
├── .gitignore            # Git ignore file
├── README.md             # This file
├── faces/                # Facial recognition models
└── tools/                # AI tool integrations
    ├── __init__.py
    ├── facial_recognition.py
    └── registry.py
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test with the web interface
5. Commit changes (`git commit -m 'Add amazing feature'`)
6. Push to branch (`git push origin feature/amazing-feature`)
7. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- OpenAI for GPT models
- ElevenLabs for voice synthesis and multiple voice personas
- WebRTC for professional audio processing
- Silero VAD for voice activity detection
- Modern web standards for cross-platform compatibility

## 📝 Version History

### v2.0.0 (Latest)
- ✨ Enhanced audio visualizer with interactive feedback
- 🎤 Added 8 preset voice personas
- 📝 Custom instruction support
- 🎨 Redesigned UI with glassmorphism
- ⚙️ Advanced settings panel
- 💾 Persistent configuration storage

### v1.0.0
- 🚀 Initial release with basic voice assistant
- 🎤 WebRTC audio support
- 🤖 OpenAI integration
- 🔊 ElevenLabs voice synthesis 