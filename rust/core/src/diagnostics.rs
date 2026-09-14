//! Diagnostics produced by the planner — port of the subset of `diagnostics.ts`
//! that `Plan` needs / `Diagnostics.java`.

use crate::span::Span;

/// Diagnostic severity. Only `Error` is constructed today.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Severity {
    Error,
    Warning,
    Info,
}

/// The closed set of diagnostic codes the planner produces. `Ord` follows the
/// Java enum's declaration order (ordinal), matching its sort semantics.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum DiagnosticCode {
    AmbiguousMatch,
    ErrorFenceWithoutStep,
    Drift,
    /// Reference blocks (ADR 0016): a link that resolves to no oath, to a
    /// section with no steps, to a chain that reaches itself, or to an anchor
    /// that names more than one heading.
    ReferenceNotFound,
    ReferenceEmpty,
    ReferenceCycle,
    AmbiguousAnchor,
}

/// One diagnostic: its code, severity, and the source span it points at.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Diagnostic {
    pub code: DiagnosticCode,
    pub severity: Severity,
    pub span: Span,
}

/// Builds an `ambiguous-match` diagnostic pointing at `span`.
pub fn ambiguous_match(span: Span) -> Diagnostic {
    Diagnostic {
        code: DiagnosticCode::AmbiguousMatch,
        severity: Severity::Error,
        span,
    }
}

/// Builds an `error-fence-without-step` diagnostic pointing at `span`.
pub fn error_fence_without_step(span: Span) -> Diagnostic {
    Diagnostic {
        code: DiagnosticCode::ErrorFenceWithoutStep,
        severity: Severity::Error,
        span,
    }
}

/// A reference block (ADR 0016) points at an oath the workspace does not hold.
/// Never prose: a link-only block that resolves to nothing has no other
/// reading, so it fails the run rather than degrading silently.
pub fn reference_not_found(span: Span) -> Diagnostic {
    Diagnostic {
        code: DiagnosticCode::ReferenceNotFound,
        severity: Severity::Error,
        span,
    }
}

/// The referenced document exists but the section contributes no steps — a
/// mistyped anchor, or a section that is pure prose.
pub fn reference_empty(span: Span) -> Diagnostic {
    Diagnostic {
        code: DiagnosticCode::ReferenceEmpty,
        severity: Severity::Error,
        span,
    }
}

/// References nest to any depth, so a chain that reaches a section already on
/// it is reported rather than recursed into.
pub fn reference_cycle(span: Span) -> Diagnostic {
    Diagnostic {
        code: DiagnosticCode::ReferenceCycle,
        severity: Severity::Error,
        span,
    }
}

/// The anchor names more than one heading in the target document (two headings
/// slugify identically), so the reference could mean either section. Reported
/// rather than guessed: rename the headings so each has an anchor of its own.
pub fn ambiguous_anchor(span: Span) -> Diagnostic {
    Diagnostic {
        code: DiagnosticCode::AmbiguousAnchor,
        severity: Severity::Error,
        span,
    }
}
