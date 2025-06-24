"""
Tools Registry for Ambit AI Function Calling
Manages all available tools and their metadata for OpenAI function calling.
"""

import json
from typing import Dict, List, Callable, Any, Optional
from concurrent.futures import Executor
import asyncio
import inspect
import functools
import warnings
from functools import partial

class ToolsRegistry:
    def __init__(self):
        self.tools: Dict[str, Callable] = {}
        self.tool_schemas: List[Dict] = []
        self.tool_flags: Dict[str, Dict] = {}
    
    def register_tool(self, name: str, function: Callable, schema: Dict, flags: Optional[Dict] = None):
        """Register a new tool with its function, schema, and flags"""
        self.tools[name] = function
        self.tool_schemas.append(schema)
        self.tool_flags[name] = flags or {}
        print(f"Registered tool: {name}")
    
    def get_tool(self, name: str) -> Callable:
        """Get a tool function by name"""
        return self.tools.get(name)
    
    def get_schemas(self) -> List[Dict]:
        """Get all tool schemas for OpenAI function calling"""
        return self.tool_schemas
    
    def call_tool(self, name: str, arguments: Dict[str, Any]) -> Any:
        """Call a tool with given arguments"""
        if name not in self.tools:
            raise ValueError(f"Tool '{name}' not found")
        
        tool_function = self.tools[name]
        return tool_function(**arguments)

    async def acall_tool(self, tool_name: str, tool_args: dict, executor: Optional[Executor] = None) -> Any:
        """Asynchronously calls a tool, running sync tools in an executor."""
        if tool_name not in self.tools:
            return f"Error: Tool '{tool_name}' not found."

        func = self.tools[tool_name]
        
        # For async tools, we can just await them directly.
        if asyncio.iscoroutinefunction(func):
            return await func(**tool_args)
        
        # For sync tools, run them in the provided executor to avoid blocking.
        if executor:
            loop = asyncio.get_running_loop()
            # Use a partial to pass arguments to the function in the executor
            p_func = partial(func, **tool_args)
            return await loop.run_in_executor(executor, p_func)
        else:
            # Fallback for when no executor is provided (will block)
            warnings.warn(
                f"Running synchronous tool '{tool_name}' without an executor. "
                "This will block the event loop."
            )
            return func(**tool_args)

# Global registry instance
tools_registry = ToolsRegistry() 