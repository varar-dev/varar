module github.com/varar-dev/varar/go

go 1.26

require github.com/cucumber/cucumber-expressions-go v6.2.0+incompatible

require github.com/stretchr/testify v1.11.1 // indirect

// v0.5.0 shipped with the conformance/bNN fixtures as an in-module test
// dependency, but those are symlinks that Go's module zip drops — so
// `go mod tidy` in any consumer importing .../go/varar failed to resolve them.
// Fixed by moving the harness to a separate module (go/conformance). Retracted
// so tooling steers to v0.5.1+.
retract v0.5.0
