import base64
import binascii
from typing import Literal

from pydantic import Field, JsonValue, ValidationError

from decepticon.tools.browser.native_protocol import NativeBrowserError, WireModel


class Tabs(WireModel):
    tabs: list[str]
    active: str | None


class Navigation(WireModel):
    url: str
    status: int | None
    title: str


class Click(WireModel):
    clicked: str
    url: str


class Typed(WireModel):
    typed_into: str
    chars: int = Field(ge=0)


class Offset(WireModel):
    dx: int
    dy: int


class Scroll(WireModel):
    scrolled: Offset
    url: str


class Binary(WireModel):
    format: Literal["png", "pdf"]
    bytes: int = Field(ge=0)
    base64: str


class Evaluation(WireModel):
    result: JsonValue


class Console(WireModel):
    count: int = Field(ge=0)
    lines: list[str]


class Source(WireModel):
    url: str
    bytes: int = Field(ge=0)
    html: str


class Active(WireModel):
    active: str


class Closed(WireModel):
    closed: Literal[True]


class Failure(WireModel):
    error: Literal["BROWSER_SCOPE_DENIED", "BROWSER_ACTION_FAILED", "BROWSER_CANCELLED"]


_MODELS: dict[str, type[WireModel]] = {
    "launch": Tabs,
    "list_tabs": Tabs,
    "goto": Navigation,
    "click": Click,
    "type": Typed,
    "scroll": Scroll,
    "screenshot": Binary,
    "pdf": Binary,
    "eval_js": Evaluation,
    "console_logs": Console,
    "page_source": Source,
    "switch_tab": Active,
    "close": Closed,
}


def validate_result(action: str, result: dict[str, JsonValue]) -> dict[str, JsonValue]:
    try:
        model = (
            Failure.model_validate(result)
            if "error" in result
            else _MODELS[action].model_validate(result)
        )
        match model:
            case Binary():
                data = base64.b64decode(model.base64, validate=True)
                expected = "png" if action == "screenshot" else "pdf"
                if len(data) != model.bytes or model.format != expected:
                    raise NativeBrowserError("BROWSER_PROTOCOL_ERROR")
            case Console():
                if model.count != len(model.lines):
                    raise NativeBrowserError("BROWSER_PROTOCOL_ERROR")
            case Source():
                if model.bytes != len(model.html):
                    raise NativeBrowserError("BROWSER_PROTOCOL_ERROR")
        return result
    except (ValidationError, binascii.Error) as exc:
        raise NativeBrowserError("BROWSER_PROTOCOL_ERROR") from exc
