import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/types'
import { useAuth } from '../../auth/useAuth'
import { getProfile, updateProfile } from './profileApi'
import type { Profile, UpdateProfileRequest } from './profileTypes'

export type ProfileLoadState =
  | 'idle'
  | 'loading'
  | 'first-time'
  | 'loaded'
  | 'load-error'

export type ProfileSaveState = 'idle' | 'saving' | 'saved' | 'save-error'

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function safeSaveError(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) {
    return error.message
  }
  return 'Không thể lưu hồ sơ. Vui lòng kiểm tra kết nối và thử lại.'
}

export function useProfile(enabled: boolean) {
  const { authenticatedRequest } = useAuth()
  const loadControllerRef = useRef<AbortController | null>(null)
  const saveControllerRef = useRef<AbortController | null>(null)
  const savingRef = useRef(false)
  const [loadState, setLoadState] = useState<ProfileLoadState>('idle')
  const [saveState, setSaveState] = useState<ProfileSaveState>('idle')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [saveError, setSaveError] = useState('')

  const load = useCallback(() => {
    if (!enabled) {
      return
    }
    loadControllerRef.current?.abort()
    const controller = new AbortController()
    loadControllerRef.current = controller
    setLoadState('loading')

    void getProfile(authenticatedRequest, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) {
          return
        }
        setProfile(response.profile)
        setLoadState('loaded')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) {
          return
        }
        if (
          error instanceof ApiError &&
          error.status === 404 &&
          error.code === 'PROFILE_NOT_FOUND'
        ) {
          setProfile(null)
          setLoadState('first-time')
          return
        }
        setLoadState('load-error')
      })
  }, [authenticatedRequest, enabled])

  useEffect(() => {
    if (!enabled) {
      loadControllerRef.current?.abort()
      saveControllerRef.current?.abort()
      setLoadState('idle')
      return
    }
    load()
    return () => {
      loadControllerRef.current?.abort()
      saveControllerRef.current?.abort()
    }
  }, [enabled, load])

  const save = useCallback(
    async (values: UpdateProfileRequest): Promise<Profile | null> => {
      if (!enabled || savingRef.current) {
        return null
      }
      savingRef.current = true
      saveControllerRef.current?.abort()
      const controller = new AbortController()
      saveControllerRef.current = controller
      setSaveState('saving')
      setSaveError('')

      try {
        const response = await updateProfile(
          authenticatedRequest,
          values,
          controller.signal,
        )
        if (controller.signal.aborted) {
          return null
        }
        setProfile(response.profile)
        setLoadState('loaded')
        setSaveState('saved')
        return response.profile
      } catch (error: unknown) {
        if (controller.signal.aborted || isAbortError(error)) {
          return null
        }
        setSaveError(safeSaveError(error))
        setSaveState('save-error')
        return null
      } finally {
        savingRef.current = false
      }
    },
    [authenticatedRequest, enabled],
  )

  const clearSaveFeedback = useCallback(() => {
    setSaveState((current) =>
      current === 'saving' ? current : 'idle',
    )
    setSaveError('')
  }, [])

  return {
    loadState,
    saveState,
    profile,
    saveError,
    load,
    save,
    clearSaveFeedback,
  }
}
