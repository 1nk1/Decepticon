from deepagents.backends.protocol import FileDownloadResponse, FileUploadResponse

from decepticon.middleware.filesystem import EngagementFilesystemBackend


class ArtifactFilesystemBackend(EngagementFilesystemBackend):
    def upload_files(self, files: list[tuple[str, bytes]]) -> list[FileUploadResponse]:
        try:
            mapped = [(self._real("/workspace/" + path), content) for path, content in files]
        except ValueError:
            return [FileUploadResponse(path=path, error="invalid_path") for path, _ in files]
        responses = self._backend.upload_files(mapped)
        return [
            FileUploadResponse(path=files[index][0], error=result.error)
            for index, result in enumerate(responses)
        ]

    def download_files(self, paths: list[str]) -> list[FileDownloadResponse]:
        return super().download_files(["/workspace/" + path for path in paths])
