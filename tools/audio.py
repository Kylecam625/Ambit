import base64
from .registry import tools_registry

AUDIO_FILE_PATH = "assets/Favsong.mp3"

def play_favorite_song():
    """
    Prepares Ambit's favorite song for playback by loading and encoding it.
    The actual playback is handled by the main server, allowing for interruption.
    This function should be called after the AI has already generated its introductory text.
    """
    try:
        with open(AUDIO_FILE_PATH, "rb") as audio_file:
            audio_data = audio_file.read()
        
        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
        
        # Return a dictionary that the backend can identify and process
        return {"is_song": True, "audio_base64": audio_base64}

    except FileNotFoundError:
        return {"error": f"Song file not found at {AUDIO_FILE_PATH}."}
    except Exception as e:
        return {"error": f"Error loading song: {str(e)}"}


# --- OpenAI Schema and Registration ---

PLAY_FAVORITE_SONG_SCHEMA = {
    "type": "function",
    "name": "play_favorite_song",
    "description": "After responding with an introductory phrase, call this function to play Ambit's favorite song. This function doesn't take any arguments.",
    "parameters": {
        "type": "object",
        "properties": {},
        "required": []
    }
}

def register_audio_tools():
    """Register the audio tools with the tools registry"""
    tools_registry.register_tool(
        "play_favorite_song", 
        play_favorite_song, 
        PLAY_FAVORITE_SONG_SCHEMA
    )
    print("🎵 Audio tools registered successfully") 