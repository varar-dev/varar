// The conformance harness is its OWN module, deliberately separate from the
// published github.com/varar-dev/varar/go module. Its bNN fixtures are symlinks
// into ../../conformance/bundles, and Go's module zip format silently drops
// symlinks — so if these packages belonged to the parent module they would be
// absent from the published zip, and `go mod tidy` in any consumer that imports
// github.com/varar-dev/varar/go/varar (whose external test used to import them)
// would fail with "module found, but does not contain package .../conformance/b01".
// As a separate module they never enter the parent's published surface.
module github.com/varar-dev/varar/go/conformance

go 1.26

require github.com/varar-dev/varar/go v0.0.0

require (
	github.com/cucumber/cucumber-expressions-go v6.2.0+incompatible // indirect
	github.com/davecgh/go-spew v1.1.1 // indirect
	github.com/pmezard/go-difflib v1.0.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

// The harness tests the in-repo parent module by path.
replace github.com/varar-dev/varar/go => ../
