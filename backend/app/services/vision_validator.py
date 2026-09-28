import base64
import binascii
import struct
from typing import Tuple, Optional

MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_DIMENSION = 16384  # 16K max resolution safeguard
MIN_DIMENSION = 1

SUPPORTED_MIME_TYPES = {
    "image/png": b"\x89PNG\r\n\x1a\n",
    "image/jpeg": b"\xff\xd8\xff",
    "image/jpg": b"\xff\xd8\xff",
    "image/webp": (b"RIFF", b"WEBP"),
}

class ImageValidationError(ValueError):
    """Raised when an uploaded image fails validation."""
    pass

def extract_image_dimensions(norm_mime: str, raw_bytes: bytes) -> Tuple[int, int]:
    """
    Extracts (width, height) from raw image bytes using header structures.
    Raises ImageValidationError if the image header is corrupt or dimensions are invalid.
    """
    if norm_mime == "image/png":
        # PNG: Header (8 bytes) + IHDR length (4 bytes) + IHDR tag (4 bytes) + width (4) + height (4)
        if len(raw_bytes) < 24:
            raise ImageValidationError("Corrupt PNG image: file is truncated.")
        if raw_bytes[12:16] != b"IHDR":
            raise ImageValidationError("Corrupt PNG image: missing initial IHDR chunk.")
        width, height = struct.unpack(">II", raw_bytes[16:24])
        return width, height

    elif norm_mime == "image/jpeg":
        # JPEG: scan through markers to find Start of Frame (SOF)
        if len(raw_bytes) < 10:
            raise ImageValidationError("Corrupt JPEG image: file is truncated.")
        offset = 2
        while offset < len(raw_bytes) - 8:
            if raw_bytes[offset] != 0xFF:
                offset += 1
                continue
            marker = raw_bytes[offset + 1]
            if marker in (0xFF, 0x00):
                offset += 1
                continue
            # SOF markers: 0xC0 .. 0xCF (excluding DHT 0xC4, JPG 0xC8, DAC 0xCC)
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                if offset + 9 > len(raw_bytes):
                    break
                height, width = struct.unpack(">HH", raw_bytes[offset + 5:offset + 9])
                return width, height
            if offset + 4 > len(raw_bytes):
                break
            length = struct.unpack(">H", raw_bytes[offset + 2:offset + 4])[0]
            offset += 2 + length
        raise ImageValidationError("Corrupt JPEG image: unable to locate valid Start of Frame (SOF) marker.")

    elif norm_mime == "image/webp":
        if len(raw_bytes) < 30:
            raise ImageValidationError("Corrupt WebP image: file is truncated.")
        tag = raw_bytes[12:16]
        if tag == b"VP8 ":
            # Lossy WebP: keyframe at 23, check start code 0x9D 0x01 0x2A
            if len(raw_bytes) < 30:
                raise ImageValidationError("Corrupt WebP VP8 image: truncated bitstream.")
            width = struct.unpack("<H", raw_bytes[26:28])[0] & 0x3FFF
            height = struct.unpack("<H", raw_bytes[28:30])[0] & 0x3FFF
            return width, height
        elif tag == b"VP8L":
            # Lossless WebP: 1-byte signature (0x2F), then 14 bits width-1, 14 bits height-1
            if len(raw_bytes) < 25:
                raise ImageValidationError("Corrupt WebP VP8L image: truncated bitstream.")
            b0, b1, b2, b3 = raw_bytes[21:25]
            width = 1 + (((b1 & 0x3F) << 8) | b0)
            height = 1 + (((b3 & 0xF) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6))
            return width, height
        elif tag == b"VP8X":
            # Extended WebP: 24-bit width-1 at 24:27, 24-bit height-1 at 27:30
            if len(raw_bytes) < 30:
                raise ImageValidationError("Corrupt WebP VP8X image: truncated bitstream.")
            width = 1 + struct.unpack("<I", raw_bytes[24:27] + b"\x00")[0]
            height = 1 + struct.unpack("<I", raw_bytes[27:30] + b"\x00")[0]
            return width, height
        else:
            raise ImageValidationError(f"Corrupt WebP image: unrecognized chunk format '{tag.decode('ascii', errors='replace')}'.")

    raise ImageValidationError(f"Unsupported format for dimension extraction: '{norm_mime}'.")

def sanitize_and_validate_image(mime_type: str, data: str) -> Tuple[str, str, int]:
    """
    Validates and normalizes an image attachment.

    Checks:
    1. MIME type validity (image/png, image/jpeg, image/webp)
    2. Base64 payload integrity
    3. File size (max 10MB, non-zero)
    4. Magic byte signature matching the declared MIME type
    5. Structural integrity and dimensions (1 <= dimension <= 16384)

    Returns:
        Tuple of (clean_mime_type, clean_base64_data, size_bytes)
    """
    if not mime_type or not isinstance(mime_type, str):
        raise ImageValidationError("MIME type is required.")

    norm_mime = mime_type.strip().lower()
    if norm_mime == "image/jpg":
        norm_mime = "image/jpeg"

    if norm_mime not in {"image/png", "image/jpeg", "image/webp"}:
        raise ImageValidationError(
            f"Unsupported image MIME type: '{mime_type}'. Supported formats: image/png, image/jpeg, image/webp."
        )

    if not data or not isinstance(data, str):
        raise ImageValidationError("Image data payload is empty or invalid.")

    # Strip data URL prefix if present (e.g., 'data:image/png;base64,...')
    clean_base64 = data.strip()
    if clean_base64.startswith("data:") and ";base64," in clean_base64:
        clean_base64 = clean_base64.split(";base64,", 1)[1]

    # Decode base64
    try:
        raw_bytes = base64.b64decode(clean_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ImageValidationError("Malformed base64 image data payload.") from exc

    size_bytes = len(raw_bytes)
    if size_bytes == 0:
        raise ImageValidationError("Image payload is empty (0 bytes).")

    if size_bytes > MAX_IMAGE_SIZE_BYTES:
        raise ImageValidationError(
            f"Image payload size ({size_bytes / (1024 * 1024):.1f}MB) exceeds the 10MB limit."
        )

    # Magic byte verification
    if norm_mime == "image/png":
        if not raw_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ImageValidationError("Image header does not match declared image/png format.")
    elif norm_mime == "image/jpeg":
        if not raw_bytes.startswith(b"\xff\xd8\xff"):
            raise ImageValidationError("Image header does not match declared image/jpeg format.")
    elif norm_mime == "image/webp":
        if len(raw_bytes) < 12 or not (raw_bytes.startswith(b"RIFF") and raw_bytes[8:12] == b"WEBP"):
            raise ImageValidationError("Image header does not match declared image/webp format.")

    # Dimension extraction & structural verification
    width, height = extract_image_dimensions(norm_mime, raw_bytes)
    if width < MIN_DIMENSION or height < MIN_DIMENSION:
        raise ImageValidationError(f"Invalid image dimensions: {width}x{height}.")
    if width > MAX_DIMENSION or height > MAX_DIMENSION:
        raise ImageValidationError(
            f"Image dimensions ({width}x{height}) exceed maximum allowed resolution ({MAX_DIMENSION}x{MAX_DIMENSION})."
        )

    return norm_mime, clean_base64, size_bytes

