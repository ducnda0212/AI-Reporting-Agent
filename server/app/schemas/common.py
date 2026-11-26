from pydantic import BaseModel, ConfigDict


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class ErrorResponse(ApiModel):
    code: str
    message: str
