/**
 * Screen context capture service for VISTA.
 * Implements browser-native getDisplayMedia snapshot capture.
 * Observation-only: captures visual frames without mouse, keyboard, or desktop control.
 */
import type { ImageAttachment, ScreenCaptureState } from '../types'

export interface ScreenCaptureCallbacks {
  onStateChange?: (state: ScreenCaptureState) => void
  onError?: (errorMessage: string) => void
  onSnapshot?: (attachment: ImageAttachment) => void
}

export function isScreenCaptureSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function'
  )
}

/**
 * Capture a single snapshot frame from the user's selected screen or application window.
 * The media stream is immediately terminated once the frame is captured to maintain privacy
 * and avoid continuous background recording.
 */
export async function captureScreenSnapshot(): Promise<ImageAttachment> {
  if (!isScreenCaptureSupported()) {
    throw new Error('Screen capture (getDisplayMedia) is not supported in this browser. Please use Chrome, Edge, or Safari, or upload a screenshot.')
  }

  let stream: MediaStream | null = null
  let video: HTMLVideoElement | null = null

  try {
    // Explicit user prompt via browser native dialog
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'monitor',
      } as any,
      audio: false,
    })

    // Attach stream to invisible video element to grab frame
    video = document.createElement('video')
    video.playsInline = true
    video.muted = true
    video.srcObject = stream
    await video.play()

    // Wait for video dimensions to be available
    await new Promise<void>((resolve) => {
      if (video!.videoWidth && video!.videoHeight) {
        resolve()
      } else {
        video!.onloadedmetadata = () => resolve()
      }
    })

    // Brief stabilization pause to ensure initial frame is rendered
    await new Promise((resolve) => setTimeout(resolve, 150))

    const width = video.videoWidth || 1920
    const height = video.videoHeight || 1080

    // Scale down if dimensions are excessively large to maintain < 10MB payload size
    let targetWidth = width
    let targetHeight = height
    const MAX_DIM = 2560
    if (targetWidth > MAX_DIM || targetHeight > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / targetWidth, MAX_DIM / targetHeight)
      targetWidth = Math.round(targetWidth * ratio)
      targetHeight = Math.round(targetHeight * ratio)
    }

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to create 2D canvas context for screen capture.')
    }

    ctx.drawImage(video, 0, 0, targetWidth, targetHeight)
    const dataUrl = canvas.toDataURL('image/png')

    // Calculate approximate size in bytes from base64 string
    const base64Content = dataUrl.split(',')[1] || ''
    const sizeBytes = Math.round((base64Content.length * 3) / 4)

    return {
      mime_type: 'image/png',
      data: dataUrl,
      filename: `screen-context-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
      size_bytes: sizeBytes,
      source: 'screen',
    }
  } catch (err: any) {
    if (err.name === 'NotAllowedError') {
      throw new Error('Screen capture was canceled or permission was denied. You can click 🖥️ Screen to try again or click 📎 to attach a file.')
    } else if (err.name === 'NotFoundError' || err.name === 'NotSupportedError') {
      throw new Error('No compatible screen capture device or display source was found.')
    }
    throw new Error(err.message || 'Failed to capture screen context.')
  } finally {
    // CRITICAL PRIVACY & RESOURCE HYGIENE:
    // Always terminate all stream tracks immediately after snapshot is grabbed.
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch {
          // ignore track cleanup error
        }
      })
    }
    if (video) {
      video.srcObject = null
      video.remove()
    }
  }
}

/**
 * High-level controller for managing screen capture state and user feedback.
 */
export class ScreenCaptureController {
  private state: ScreenCaptureState = 'idle'
  private callbacks: ScreenCaptureCallbacks

  constructor(callbacks?: ScreenCaptureCallbacks) {
    this.callbacks = callbacks || {}
    if (!isScreenCaptureSupported()) {
      this.state = 'unsupported'
      this.callbacks.onStateChange?.('unsupported')
    }
  }

  public async captureSnapshot(): Promise<ImageAttachment | null> {
    if (!isScreenCaptureSupported()) {
      const err = 'Screen capture is not supported in this browser environment.'
      this.state = 'unsupported'
      this.callbacks.onStateChange?.('unsupported')
      this.callbacks.onError?.(err)
      return null
    }

    this.state = 'requesting_permission'
    this.callbacks.onStateChange?.('requesting_permission')

    try {
      this.state = 'capturing'
      this.callbacks.onStateChange?.('capturing')

      const attachment = await captureScreenSnapshot()

      this.state = 'active'
      this.callbacks.onStateChange?.('active')
      this.callbacks.onSnapshot?.(attachment)
      return attachment
    } catch (err: any) {
      const isDenied = err.message && err.message.includes('canceled or permission was denied')
      this.state = isDenied ? 'permission_denied' : 'idle'
      this.callbacks.onStateChange?.(this.state)
      this.callbacks.onError?.(err.message || 'Failed to capture screen snapshot.')
      return null
    }
  }

  public clear() {
    this.state = 'idle'
    this.callbacks.onStateChange?.('idle')
  }

  public getState(): ScreenCaptureState {
    return this.state
  }
}
