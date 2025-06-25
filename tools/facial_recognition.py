"""
Facial Recognition Tool for Ambit AI
Provides facial recognition capabilities using DeepFace and webcam input.
Refactored for clarity, robustness, and correct concurrent execution.
"""

import os
import cv2
import shutil
import tempfile
import time
import pickle
from typing import Dict, Any
from deepface import DeepFace
from .camera_utils import capture_image

# --- Directory Setup ---
FACES_DIR = "faces"
KNOWN_FACES_FILE = os.path.join(FACES_DIR, "ds_model_facenet_detector_opencv_aligned_normalization_base_expand_0.pkl")
if not os.path.exists(FACES_DIR):
    os.makedirs(FACES_DIR)
    print(f"📁 Created faces directory: {FACES_DIR}")

# --- Helper Functions ---

def _find_face_match(image_path: str) -> (str, str):
    """
    Uses DeepFace to find a matching face in the database.
    Returns the name of the match or an error string.
    """
    try:
        # First, detect if there's actually a face in the image using a robust detector
        print(f"[DEBUG] Checking for face detection in {image_path}")
        try:
            # Use RetinaFace for more accurate detection (mentioned as overperforming in docs)
            face_objs = DeepFace.extract_faces(
                img_path=image_path,
                enforce_detection=True,  # This will raise an exception if no face detected
                detector_backend="retinaface",  # More robust than opencv
                align=True
            )
            if not face_objs or len(face_objs) == 0:
                print("[DEBUG] No faces detected in image")
                return None, "No face detected in image."
            print(f"[DEBUG] Found {len(face_objs)} face(s) in image")
        except Exception as detection_error:
            print(f"[DEBUG] Face detection failed: {detection_error}")
            # Fallback to mtcnn if retinaface fails
            try:
                print("[DEBUG] Trying fallback detector (mtcnn)...")
                face_objs = DeepFace.extract_faces(
                    img_path=image_path,
                    enforce_detection=True,
                    detector_backend="mtcnn",
                    align=True
                )
                if not face_objs or len(face_objs) == 0:
                    print("[DEBUG] No faces detected with fallback detector")
                    return None, "No face detected in image."
                print(f"[DEBUG] Fallback detector found {len(face_objs)} face(s)")
            except Exception as fallback_error:
                print(f"[DEBUG] Fallback detection also failed: {fallback_error}")
                return None, "No face detected in image."
        
        # If we get here, there's at least one face, so proceed with matching
        results = DeepFace.find(
            img_path=image_path,
            db_path=FACES_DIR,
            model_name='Facenet',
            detector_backend="retinaface",  # Use same robust detector for consistency
            enforce_detection=False,  # We already validated detection above
            silent=True
        )
        # DeepFace.find returns a list of pandas dataframes.
        # We add extra checks to ensure the result is a non-empty list of dataframes.
        if isinstance(results, list) and len(results) > 0 and not results[0].empty:
            best_match_path = results[0].iloc[0]['identity']
            name = os.path.splitext(os.path.basename(best_match_path))[0]
            print(f"[DEBUG] Face matching found: {name}")
            return name, None
        else:
            print("[DEBUG] Face detected but no match found in database")
            return None, "Face detected but no match found."
    except Exception as e:
        # This can happen if the db is empty, contains non-image files, etc.
        print(f"DeepFace recognition error: {e}")
        return None, "DeepFace error during recognition."
    
    return None, "No match found."

def get_face_encoding(image_path):
    """Gets the face encoding for a single image."""
    try:
        # The `enforce_detection=False` is important for single images
        embedding_objs = DeepFace.represent(
            img_path=image_path,
            model_name="Facenet",
            enforce_detection=False,
            detector_backend="opencv"
        )
        if embedding_objs and 'embedding' in embedding_objs[0]:
            return embedding_objs[0]['embedding']
    except Exception as e:
        print(f"Error getting face encoding: {e}")
    return None

def save_known_faces(known_faces):
    """Saves the known faces dictionary to a pickle file."""
    with open(KNOWN_FACES_FILE, "wb") as f:
        pickle.dump(known_faces, f)

def load_known_faces():
    """Loads known faces from the pickle file."""
    if os.path.exists(KNOWN_FACES_FILE):
        with open(KNOWN_FACES_FILE, "rb") as f:
            return pickle.load(f)
    return {}

# --- Main Tool Functions ---

def identify_user() -> Dict[str, Any]:
    """
    Captures and identifies a user via webcam. This is a BLOCKING, CPU-BOUND function.
    """
    print("[DEBUG] identify_user function called - capturing webcam image...")
    frame, error = capture_image()
    if error:
        print(f"[DEBUG] Camera error: {error}")
        return {"response": error}

    # A temporary file is needed for DeepFace to analyze
    tmp_file = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp_file = tmp.name
        cv2.imwrite(tmp_file, frame)
        print(f"[DEBUG] Saved webcam capture to {tmp_file}")

        # Only search for a match if there are known faces
        if not any(f.lower().endswith(('.jpg', '.jpeg', '.png')) for f in os.listdir(FACES_DIR)):
            print("[DEBUG] No known faces in database")
            return {
                "response": "I don't recognize you. I'll go ahead and remember you. What's your name?",
                "needs_name": True,
                "face_image_path": tmp_file
            }

        print("[DEBUG] Searching for face match...")
        name, error_msg = _find_face_match(tmp_file)
        
        if error_msg and "No face detected" in error_msg:
            print("[DEBUG] No face detected in camera view")
            return {"response": "I don't see anyone in the camera view right now."}
        elif name:
            print(f"[DEBUG] Found match: {name}")
            return {"response": f"You're {name}! I remember you."}
        else:
            # Face detected but no match found, ask for name
            print("[DEBUG] Face detected but no match found")
            return {
                "response": "I can see someone, but I don't recognize you. I'll go ahead and remember you. What's your name?",
                "needs_name": True,
                "face_image_path": tmp_file
            }
    except Exception as e:
        print(f"Error in identify_user: {e}")
        return {"response": f"Sorry, I encountered a recognition error: {str(e)}"}
    finally:
        # Clean up the temp image if a name was found (and the temp file path exists)
        if 'name' in locals() and name and tmp_file and os.path.exists(tmp_file):
             os.remove(tmp_file)


def save_new_user_face(name: str, face_image_path: str) -> Dict[str, Any]:
    """
    Saves a new user's face image to the database. This is a BLOCKING function (file I/O).
    """
    if not name or not name.strip() or not face_image_path or not os.path.exists(face_image_path):
        if face_image_path and os.path.exists(face_image_path):
             os.remove(face_image_path) # Clean up orphaned image
        return {"response": "Sorry, something went wrong. I couldn't save the face because the name or image was missing."}
        
    try:
        print(f"[DEBUG] Starting save_new_user_face with name={name}, face_image_path={face_image_path}")
        clean_name = "".join(c for c in name.strip() if c.isalnum() or c in (' ', '_', '-')).strip().replace(' ', '_')
        print(f"[DEBUG] Sanitized clean_name={clean_name}")
        destination_path = os.path.join(FACES_DIR, f"{clean_name}.jpg")
        print(f"[DEBUG] Initial destination_path={destination_path}")
        
        # Handle potential name collisions
        counter = 1
        original_destination = destination_path
        while os.path.exists(destination_path):
            name_part, ext = os.path.splitext(original_destination)
            destination_path = f"{name_part}_{counter}{ext}"
            counter += 1
        print(f"[DEBUG] Final destination_path={destination_path}")
        
        shutil.move(face_image_path, destination_path)
        print(f"[DEBUG] Moved face image to {destination_path}")
        
        # When a new face is added, DeepFace's cached representations become stale.
        # Removing this file forces DeepFace to rebuild it on the next `find` call.
        pickle_file = os.path.join(FACES_DIR, "representations_facenet.pkl")
        if os.path.exists(pickle_file):
            os.remove(pickle_file)
            print(f"🗑️ Removed stale embeddings file: {pickle_file}")

        print(f"✅ Saved new face: {destination_path}")
        return {"response": f"Got it, {clean_name}! I've saved your face for next time."}
    except Exception as e:
        import traceback as _tb
        _tb.print_exc()
        print(f"Error in save_new_user_face: {e}")
        return {"response": f"Sorry, I couldn't save your face due to an error: {str(e)}"}
    finally:
        # Ensure the temp file is gone even if saving fails
        if face_image_path and os.path.exists(face_image_path):
            os.remove(face_image_path)
            print(f"[DEBUG] Cleaned up temp image {face_image_path}")

# --- OpenAI Schemas and Registration ---

IDENTIFY_USER_SCHEMA = {
    "type": "function",
    "name": "identify_user",
    "description": "ALWAYS capture webcam image and identify user using facial recognition. MUST be called every single time user asks 'Who am I?', 'What's my name?', 'Do you recognize me?' or any identity question - even if you think you already know. Never answer identity questions from memory.",
    "parameters": {
        "type": "object",
        "properties": {},
        "required": []
    }
}

SAVE_USER_FACE_SCHEMA = {
    "type": "function", 
    "name": "save_new_user_face",
    "description": "Save a new user's face with their name after they've been identified as unknown. Use after identify_user returns needs_name=true and user provides their name.",
    "parameters": {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "The person's name to associate with their face"
            },
            "face_image_path": {
                "type": "string", 
                "description": "Path to the temporary face image provided by the `identify_user` function."
            }
        },
        "required": ["name", "face_image_path"]
    }
}

def register_facial_recognition_tools():
    """Register the facial recognition tools with the tools registry"""
    from .registry import tools_registry
    
    tools_registry.register_tool(
        "identify_user", 
        identify_user, 
        IDENTIFY_USER_SCHEMA,
        flags={"cpu_bound": True}  # This is CPU-intensive
    )
    tools_registry.register_tool(
        "save_new_user_face", 
        save_new_user_face, 
        SAVE_USER_FACE_SCHEMA
        # No flag needed, will default to a thread for I/O
    )
    
    print("📸 Facial recognition tools registered successfully") 