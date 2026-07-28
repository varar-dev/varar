using System.Runtime.CompilerServices;

// The adapter's discovery/run logic is internal — the drift gate and the example/drift TestCase
// shapes are exercised by Varar.TestAdapter.Tests through the injectable-workspace seam.
[assembly: InternalsVisibleTo("Varar.TestAdapter.Tests")]
