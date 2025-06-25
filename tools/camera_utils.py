"""
Shared camera utility functions for Ambit AI tools.
"""
import cv2
import time
from typing import Any

def capture_image() -> (Any, str):
    """
    Captures an image from the default webcam.
    Returns the image frame and an error message if something fails.
    """
    # Use 0 for default webcam, or change if you have multiple cameras
    cap = cv2.VideoCapture(0) 
    if not cap.isOpened():
        return None, "Sorry, I can't access your camera right now."
    
    try:
        # Give the camera a moment to auto-adjust exposure and focus
        time.sleep(1)
        ret, frame = cap.read()
        if not ret:
            return None, "Sorry, I couldn't capture an image from your camera."
        return frame, None
    finally:
        # Always release the camera resource
        cap.release() 