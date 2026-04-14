type MessageHandler = (payload: unknown) => void

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void
  setState(state: unknown): void
  getState(): unknown
}

const vscode = acquireVsCodeApi()
const handlers = new Map<string, MessageHandler>()

window.addEventListener('message', (event: MessageEvent) => {
  const { type, payload } = event.data as { type: string; payload: unknown }
  handlers.get(type)?.(payload)
})

function serialize(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null))
}

function request<T = unknown>(type: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const responseType = `${type}:response`
    handlers.set(responseType, (data: unknown) => {
      handlers.delete(responseType)
      if (data && typeof data === 'object' && 'error' in data) {
        reject(new Error((data as { error: string }).error))
      } else {
        resolve(data as T)
      }
    })
    vscode.postMessage({ type, payload: payload !== undefined ? serialize(payload) : undefined })
  })
}

function on(type: string, handler: MessageHandler): () => void {
  handlers.set(type, handler)
  return () => handlers.delete(type)
}

function notify(type: string, payload?: unknown): void {
  vscode.postMessage({ type, payload: payload !== undefined ? serialize(payload) : undefined })
}

export const api = { request, on, notify }
