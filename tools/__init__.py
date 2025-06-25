"""
Tools package for Ambit AI
This directory will contain all the function calling tools that Ambit can use.
"""

# Import and register available tools
from .facial_recognition import register_facial_recognition_tools
from .vision import register_vision_tools

# Register all tools
register_facial_recognition_tools()
register_vision_tools()

# Future tool imports will go here
# from .web_search import web_search_tool
# from .file_operations import file_operations_tool 