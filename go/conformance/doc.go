// Package conformance runs the shared language-neutral corpus
// (../../conformance/bundles) against the Go port's registry/plan/trace
// stages. It lives in a separate module so its symlinked bNN fixtures never
// become a published dependency of github.com/varar-dev/varar/go — see go.mod.
package conformance
