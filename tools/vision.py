"""
Vision Tool for Ambit AI
Provides the ability to see and understand images.
"""

import os
import cv2
import base64
import tempfile
import openai
from typing import Dict, Any

from .camera_utils import capture_image
from ambit_instructions import get_system_prompt

# --- Main Tool Function ---

def analyze_image_from_webcam(user_prompt: str) -> Dict[str, Any]:
    """
    Captures an image from the webcam, sends it to a vision-capable model
    for analysis, and returns a descriptive response. This is a BLOCKING,
    I/O-bound, and potentially long-running function.
    """
    print("[DEBUG] analyze_image_from_webcam function called...")
    
    # 1. Capture the image
    frame, error = capture_image()
    if error:
        print(f"[DEBUG] Camera error: {error}")
        return {"response": error}

    # 2. Encode the image for API transmission
    tmp_file = None
    try:
        # Save to a temporary file to encode it
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp_file = tmp.name
        cv2.imwrite(tmp_file, frame)
        print(f"[DEBUG] Saved webcam capture to {tmp_file}")

        # Read the file and encode it in base64
        with open(tmp_file, "rb") as image_file:
            base64_image = base64.b64encode(image_file.read()).decode('utf-8')
        
        image_url = f"data:image/jpeg;base64,{base64_image}"

        # 3. Get the prompts
        system_prompt = get_system_prompt()
        full_user_prompt = f"User's request: '{user_prompt}'. Analyze the user-provided image and respond in character."

        # 4. Call OpenAI Vision API
        print("[DEBUG] Sending image to OpenAI for analysis...")
        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": full_user_prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": image_url, "detail": "low"},
                        },
                    ],
                }
            ],
            max_tokens=500,
        )
        
        analysis = response.choices[0].message.content
        print(f"[DEBUG] OpenAI analysis received: {analysis[:100]}...")
        return {"response": analysis}

    except Exception as e:
        print(f"Error in analyze_image_from_webcam: {e}")
        return {"response": f"Sorry, I encountered an error analyzing the image: {str(e)}"}
    finally:
        # Clean up the temporary image file
        if tmp_file and os.path.exists(tmp_file):
            os.remove(tmp_file)
            print(f"[DEBUG] Cleaned up temp image {tmp_file}")


# --- OpenAI Schema and Registration ---

ANALYZE_IMAGE_SCHEMA = {
    "type": "function",
    "name": "analyze_image_from_webcam",
    "description": "Capture an image from the webcam and describe it or answer a question about it. Use when the user asks a question about what they are showing you, like 'What do you think of this?', 'Look at this.', 'Can you see this?', or 'Check this out'.",
    "parameters": {
        "type": "object",
        "properties": {
            "user_prompt": {
                "type": "string",
                "description": "The user's original verbatim prompt or question about the image. For example, 'what do you think of this amazing painting?'"
            }
        },
        "required": ["user_prompt"]
    }
}

def register_vision_tools():
    """Register the vision tools with the tools registry"""
    from .registry import tools_registry
    
    tools_registry.register_tool(
        "analyze_image_from_webcam", 
        analyze_image_from_webcam, 
        ANALYZE_IMAGE_SCHEMA,
        flags={"long_running": True}
    )
    
    print("👁️ Vision tools registered successfully") 