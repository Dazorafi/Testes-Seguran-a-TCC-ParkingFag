import cv2


class LoopingVideo:
    def __init__(self, path: str):
        self.path = path
        self.capture = cv2.VideoCapture(path)
        self.fps = self.capture.get(cv2.CAP_PROP_FPS) or 24
        self.frame_count = self.capture.get(cv2.CAP_PROP_FRAME_COUNT)
        self.loops = 0
        if not self.capture.isOpened():
            raise OSError("Não foi possível abrir a fonte de vídeo")

    def read(self):
        success, frame = self.capture.read()
        if success and frame is not None and frame.size:
            return frame
        position = self.capture.get(cv2.CAP_PROP_POS_FRAMES)
        if self.frame_count > 0 and position >= self.frame_count - 1:
            self.capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
            success, frame = self.capture.read()
            if success and frame is not None and frame.size:
                self.loops += 1
                return frame
        raise OSError("Falha na captura de vídeo")

    def close(self):
        self.capture.release()
