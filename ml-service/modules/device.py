"""
CollabLens — Device Detection & GPU Verification Module

Priority: CUDA GPU > CPU
This module runs BEFORE any model loading to determine the optimal compute
device. All downstream modules import `DEVICE` from here.

Verification flow:
  1. Check if CUDA is available via torch.cuda
  2. If yes -> verify GPU is functional with a small tensor operation
  3. If verification passes -> use 'cuda'
  4. If anything fails -> fall back to 'cpu' gracefully
"""

import sys
import os

# Force UTF-8 output on Windows (must run before any print with emoji)
if sys.platform == 'win32':
    os.environ['PYTHONIOENCODING'] = 'utf-8'
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')

import torch
import torch.version
from typing import Any, Dict


def detect_device():
    """
    Detect the best available compute device with verification.

    Returns:
        torch.device: The verified compute device ('cuda' or 'cpu')
    """
    # Step 1: Check CUDA availability
    if not torch.cuda.is_available():
        print("ℹ️  CUDA not available — using CPU")
        return torch.device('cpu')

    # Step 2: CUDA is reported available — verify it actually works
    try:
        gpu_name = torch.cuda.get_device_name(0)
        gpu_memory = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)  # GB

        # Step 3: Run a small tensor operation to confirm GPU is functional
        test_tensor = torch.randn(64, 64, device='cuda')
        result = torch.matmul(test_tensor, test_tensor.T)
        del test_tensor, result
        torch.cuda.empty_cache()

        cuda_ver = getattr(torch.version, 'cuda', 'unknown') or 'unknown'
        print(f"✅ CUDA GPU verified and operational")
        print(f"   Device:  {gpu_name}")
        print(f"   Memory:  {gpu_memory:.1f} GB")
        print(f"   CUDA:    {cuda_ver}")
        print(f"   PyTorch: {torch.__version__}")
        return torch.device('cuda')

    except RuntimeError as e:
        print(f"⚠️  CUDA reported available but GPU verification failed: {e}")
        print("   Falling back to CPU")
        return torch.device('cpu')

    except Exception as e:
        print(f"⚠️  Unexpected error during GPU verification: {e}")
        print("   Falling back to CPU")
        return torch.device('cpu')


# ─── Module-level singleton ───────────────────────────────────
# Detect once at import time. All other modules import this.
DEVICE = detect_device()
DEVICE_STR = str(DEVICE)  # 'cuda' or 'cpu' — useful for HuggingFace pipeline args


def get_device_info() -> Dict[str, Any]:
    """Return a dict of device info for the /health endpoint."""
    info: Dict[str, Any] = {
        "device": DEVICE_STR,
        "torch_version": str(torch.__version__),
        "python_version": sys.version.split()[0]
    }
    if DEVICE_STR == 'cuda':
        info["gpu_name"] = torch.cuda.get_device_name(0)
        info["gpu_memory_gb"] = round(
            float(torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)), 1
        )
        info["cuda_version"] = getattr(torch.version, 'cuda', None) or 'unknown'
    return info
