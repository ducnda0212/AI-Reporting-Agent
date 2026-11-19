from fastapi import HTTPException


def api_error(status: int, code: str, message: str = "") -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message or code})


def from_service_error(e: Exception, status: int) -> HTTPException:
    """Service errors read 'E_CODE' or 'E_CODE: detail'."""
    code, _, detail = str(e).partition(": ")
    return api_error(status, code, detail or code)
