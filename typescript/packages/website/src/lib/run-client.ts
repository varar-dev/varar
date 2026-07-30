import type { Drift, OathResults } from '@varar/core'

export type RunInput = {
  varPath: string
  varSource: string
  stepFiles: ReadonlyArray<{ path: string; source: string }>
  exampleIndex?: number
  // Accept all current drift for this oath (snapshot-update semantics).
  update?: boolean
}

export type RunOutcome = {
  results: OathResults
  drifts: ReadonlyArray<Drift>
}

// The worker is shared across every editor group on the page (one worker,
// many concurrent runs), so requests are tagged with an id and matched back
// to the right caller — `runOath` can be in flight for two groups at once
// (e.g. two examples on the same page both scheduling a run on load), and
// responses are not guaranteed to arrive in call order.
type WorkerRequest = RunInput & { requestId: number }
type WorkerResponse = { requestId: number; results: OathResults; drifts: ReadonlyArray<Drift> }

let worker: Worker | null = null
let nextRequestId = 0

function spawn(): Worker {
  worker = new Worker(new URL('./run-worker.ts', import.meta.url), { type: 'module' })
  return worker
}

export function runOath(input: RunInput, timeoutMs = 5000): Promise<RunOutcome> {
  const w = worker ?? spawn()
  const requestId = nextRequestId++
  return new Promise<RunOutcome>((resolve, reject) => {
    const onMessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.requestId !== requestId) return // another call's response
      cleanup()
      resolve({ results: e.data.results, drifts: e.data.drifts ?? [] })
    }
    const onError = (e: ErrorEvent) => {
      cleanup()
      worker = null
      w.terminate()
      reject(new Error(e.message))
    }
    const timer = setTimeout(() => {
      cleanup()
      worker = null
      w.terminate()
      reject(new Error(`run timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    function cleanup(): void {
      clearTimeout(timer)
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)
    }
    w.addEventListener('message', onMessage)
    w.addEventListener('error', onError)
    w.postMessage({ ...input, requestId } satisfies WorkerRequest)
  })
}
