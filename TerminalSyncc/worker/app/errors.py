"""Structured errors for the MT5 worker (HTTP mapping + stable codes)."""


class WorkerError(Exception):
    """Operational failure with machine-readable code and safe client message."""

    __slots__ = ("code", "message", "http_status")

    def __init__(self, code: str, message: str, http_status: int = 502) -> None:
        self.code = code
        self.message = message
        self.http_status = http_status
        super().__init__(message)


class TemplateValidationError(WorkerError):
    """MT5_TEMPLATE path missing or not a usable portable layout."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(code, message, http_status=503)
