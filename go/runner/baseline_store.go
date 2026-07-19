package runner

import (
	"os"
	"path/filepath"
)

// FileBaselineStore is the filesystem BaselineStore: the committed drift
// baseline lives at the project root as varar.lock.json. The core owns the
// format; this only reads and writes the raw text.
type FileBaselineStore struct {
	path string
}

// NewFileBaselineStore builds a store rooted at root/varar.lock.json.
func NewFileBaselineStore(root string) *FileBaselineStore {
	return &FileBaselineStore{path: filepath.Join(root, "varar.lock.json")}
}

// Read returns the lockfile contents, or ok=false when absent/unreadable.
func (s *FileBaselineStore) Read() (string, bool) {
	b, err := os.ReadFile(s.path)
	if err != nil {
		return "", false
	}
	return string(b), true
}

// Write persists the lockfile contents (best-effort).
func (s *FileBaselineStore) Write(contents string) {
	_ = os.WriteFile(s.path, []byte(contents), 0o644)
}
