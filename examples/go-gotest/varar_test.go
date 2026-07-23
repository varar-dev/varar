package example_test

import (
	"testing"

	example "github.com/varar-dev/varar-examples/go-gotest"
	"github.com/varar-dev/varar/go/gotest"
)

// TestVarar runs every Markdown oath matched by varar.config.json as a Go
// subtest — one per example — through the gotest adapter.
//
//	go test                                  # one subtest per example, all green
//	go test -v                               # lists every example
//	go test -run 'TestVarar/yahtzee'         # run a single oath
//	VARAR_UPDATE=1 go test                     # accept drift
func TestVarar(t *testing.T) {
	gotest.Run(t, ".", example.BuildRegistry, example.Context)
}
