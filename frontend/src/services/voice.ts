/**
 * Modular Voice Service for VISTA
 * Provides browser-native Speech-to-Text (STT) and Text-to-Speech (TTS) capabilities
 * with clean abstractions and resilient fallbacks.
 */

import type { VoiceRecognitionState, VoicePlaybackState } from '../types'

// Type augmentation for webkitSpeechRecognition
interface IWindowWithSpeech extends Window {
  SpeechRecognition?: any
  webkitSpeechRecognition?: any
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false
  const win = window as IWindowWithSpeech
  return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition)
}

export function isSpeechSynthesisSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

/**
 * Prepares technical Markdown text for natural spoken audio.
 * Strips code fences, special symbols, and raw syntax while preserving
 * natural sentence flow and clarity.
 */
export function prepareTextForSpeech(markdown: string): string {
  if (!markdown) return ''

  let text = markdown

  // Replace code blocks with concise spoken notification
  text = text.replace(/```[\s\S]*?```/g, ' A code example is provided on your screen. ')

  // Replace inline code with the contained text
  text = text.replace(/`([^`]+)`/g, '$1')

  // Remove markdown headers
  text = text.replace(/^#{1,6}\s+/gm, '')

  // Remove bold and italic markers
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
  text = text.replace(/\*([^*]+)\*/g, '$1')
  text = text.replace(/__([^_]+)__/g, '$1')
  text = text.replace(/_([^_]+)_/g, '$1')

  // Remove blockquotes and list bullets
  text = text.replace(/^>\s*/gm, '')
  text = text.replace(/^[-*+]\s+/gm, '')
  text = text.replace(/^\d+\.\s+/gm, '')

  // Clean up links: [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  // Normalize excessive whitespace and punctuation
  text = text.replace(/\s+/g, ' ').trim()

  return text
}

export interface VoiceRecognitionCallbacks {
  onInterimTranscript?: (text: string) => void
  onFinalTranscript?: (text: string) => void
  onStateChange?: (state: VoiceRecognitionState) => void
  onError?: (errorMessage: string) => void
}

export class VoiceRecognitionController {
  private recognition: any = null
  private state: VoiceRecognitionState = 'idle'
  private callbacks: VoiceRecognitionCallbacks = {}

  constructor(callbacks: VoiceRecognitionCallbacks = {}) {
    this.callbacks = callbacks
    this.initRecognition()
  }

  private initRecognition() {
    if (!isSpeechRecognitionSupported()) {
      this.state = 'unsupported'
      this.callbacks.onStateChange?.('unsupported')
      return
    }

    const win = window as IWindowWithSpeech
    const SpeechRecClass = win.SpeechRecognition || win.webkitSpeechRecognition

    try {
      this.recognition = new SpeechRecClass()
      this.recognition.continuous = false
      this.recognition.interimResults = true
      this.recognition.lang = 'en-US'

      this.recognition.onstart = () => {
        this.state = 'listening'
        this.callbacks.onStateChange?.('listening')
      }

      this.recognition.onresult = (event: any) => {
        let interimText = ''
        let finalText = ''

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i]
          const transcript = item[0]?.transcript || ''
          if (item.isFinal) {
            finalText += transcript
          } else {
            interimText += transcript
          }
        }

        if (interimText && this.callbacks.onInterimTranscript) {
          this.callbacks.onInterimTranscript(interimText)
        }

        if (finalText && this.callbacks.onFinalTranscript) {
          this.callbacks.onFinalTranscript(finalText)
        }
      }

      this.recognition.onerror = (event: any) => {
        const errType = event.error || 'unknown'
        let userMessage = 'Microphone speech recognition encountered an error.'

        if (errType === 'not-allowed') {
          userMessage = 'Microphone access was denied. Please allow microphone permissions in your browser.'
        } else if (errType === 'no-speech') {
          userMessage = 'No speech was detected. Please try speaking again.'
        } else if (errType === 'network') {
          userMessage = 'Speech recognition network error. Please verify network connectivity.'
        }

        this.state = 'error'
        this.callbacks.onStateChange?.('error')
        this.callbacks.onError?.(userMessage)
      }

      this.recognition.onend = () => {
        if (this.state === 'listening' || this.state === 'processing') {
          this.state = 'idle'
          this.callbacks.onStateChange?.('idle')
        }
      }
    } catch (err: unknown) {
      this.state = 'error'
      this.callbacks.onStateChange?.('error')
      this.callbacks.onError?.('Failed to initialize browser speech recognition.')
    }
  }

  public start() {
    if (!this.recognition) {
      if (!isSpeechRecognitionSupported()) {
        this.callbacks.onError?.('Speech recognition is not supported in this browser. Please use a Chromium-based browser (Chrome, Edge) or enter text.')
        return
      }
      this.initRecognition()
    }

    try {
      this.recognition?.start()
    } catch (err: any) {
      // If already started or aborting, ignore or restart cleanly
      if (err.name !== 'InvalidStateError') {
        this.callbacks.onError?.(err.message || 'Unable to start speech recognition.')
      }
    }
  }

  public stop() {
    try {
      this.recognition?.stop()
    } catch {
      // Ignore stop errors
    }
  }

  public abort() {
    try {
      this.recognition?.abort()
    } catch {
      // Ignore abort errors
    }
    this.state = 'idle'
    this.callbacks.onStateChange?.('idle')
  }

  public destroy() {
    this.stop()
    if (this.recognition) {
      this.recognition.onstart = null
      this.recognition.onaudiostart = null
      this.recognition.onspeechstart = null
      this.recognition.onspeechend = null
      this.recognition.onresult = null
      this.recognition.onerror = null
      this.recognition.onend = null
      this.recognition = null
    }
    this.state = 'idle'
  }

  public getState(): VoiceRecognitionState {
    return this.state
  }
}

export interface VoiceSynthesisCallbacks {
  onStateChange?: (state: VoicePlaybackState) => void
  onError?: (err: string) => void
}

export class VoiceSynthesisController {
  private currentUtterance: SpeechSynthesisUtterance | null = null
  private state: VoicePlaybackState = 'idle'
  private callbacks: VoiceSynthesisCallbacks

  constructor(callbacks?: VoiceSynthesisCallbacks | ((state: VoicePlaybackState) => void)) {
    if (typeof callbacks === 'function') {
      this.callbacks = { onStateChange: callbacks }
    } else {
      this.callbacks = callbacks || {}
    }

    if (!isSpeechSynthesisSupported()) {
      this.state = 'unsupported'
      this.callbacks.onStateChange?.('unsupported')
    }
  }

  public getCurrentUtterance(): SpeechSynthesisUtterance | null {
    return this.currentUtterance
  }

  public speak(text: string, onEnd?: () => void, onError?: (err: string) => void) {
    if (!isSpeechSynthesisSupported()) {
      const err = 'Text-to-Speech is not supported in this browser.'
      this.callbacks.onError?.(err)
      onError?.(err)
      return
    }

    // Stop any active playback before starting new speech
    this.stop()

    const spokenText = prepareTextForSpeech(text)
    if (!spokenText.trim()) {
      onEnd?.()
      return
    }

    const utterance = new SpeechSynthesisUtterance(spokenText)
    utterance.rate = 1.05 // natural, crisp technical pace
    utterance.pitch = 1.0

    // Try selecting natural English voice if available
    const voices = window.speechSynthesis.getVoices()
    const naturalVoice = voices.find(
      (v) => (v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Online')))
    ) || voices.find((v) => v.lang.startsWith('en'))

    if (naturalVoice) {
      utterance.voice = naturalVoice
    }

    utterance.onstart = () => {
      this.state = 'speaking'
      this.callbacks.onStateChange?.('speaking')
    }

    utterance.onend = () => {
      this.state = 'idle'
      this.callbacks.onStateChange?.('idle')
      this.currentUtterance = null
      onEnd?.()
    }

    utterance.onerror = (event: any) => {
      // If manually canceled, do not treat as failure
      if (event.error === 'canceled' || event.error === 'interrupted') {
        this.state = 'idle'
        this.callbacks.onStateChange?.('idle')
        this.currentUtterance = null
        return
      }

      this.state = 'idle'
      this.callbacks.onStateChange?.('idle')
      this.currentUtterance = null
      const errMsg = `Speech synthesis error: ${event.error}`
      this.callbacks.onError?.(errMsg)
      onError?.(errMsg)
    }

    this.currentUtterance = utterance
    window.speechSynthesis.speak(utterance)
  }

  public stop() {
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel()
    }
    this.state = 'idle'
    this.currentUtterance = null
    this.callbacks.onStateChange?.('idle')
  }

  public pause() {
    if (isSpeechSynthesisSupported() && this.state === 'speaking') {
      window.speechSynthesis.pause()
      this.state = 'paused'
      this.callbacks.onStateChange?.('paused')
    }
  }

  public resume() {
    if (isSpeechSynthesisSupported() && this.state === 'paused') {
      window.speechSynthesis.resume()
      this.state = 'speaking'
      this.callbacks.onStateChange?.('speaking')
    }
  }

  public isSpeaking(): boolean {
    return this.state === 'speaking'
  }

  public getState(): VoicePlaybackState {
    return this.state
  }
}
