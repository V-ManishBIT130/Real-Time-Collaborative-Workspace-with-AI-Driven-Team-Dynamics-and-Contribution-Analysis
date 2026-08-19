import torch
import torch.version  # noqa: explicit import for type checker
print("Torch:", torch.__version__)
print("CUDA available:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("GPU:", torch.cuda.get_device_name(0))
    print("GPU Memory:", round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 1), "GB")
    print("CUDA version:", torch.version.cuda)
    # Verification test
    t = torch.randn(64, 64, device='cuda')
    r = torch.matmul(t, t.T)
    print("GPU verification: PASSED")
    del t, r
    torch.cuda.empty_cache()
else:
    print("GPU: None (CPU only)")
