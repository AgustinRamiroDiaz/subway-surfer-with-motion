from types import SimpleNamespace

from pose_estimation_tracker_server.preview import count_visible_keypoints, get_track_ids


class FakeTensor:
    def __init__(self, value):
        self.value = value

    def cpu(self):
        return self

    def int(self):
        return self

    def tolist(self):
        return self.value

    def __ge__(self, threshold):
        return FakeTensor([[score >= threshold for score in row] for row in self.value])

    def sum(self):
        return FakeScalar(sum(sum(1 for item in row if item) for row in self.value))


class FakeScalar:
    def __init__(self, value):
        self.value = value

    def item(self):
        return self.value


def test_get_track_ids_returns_ultralytics_track_ids():
    result = SimpleNamespace(
        boxes=SimpleNamespace(
            is_track=True,
            id=FakeTensor([4, 8]),
        )
    )

    assert get_track_ids(result) == [4, 8]


def test_count_visible_keypoints_uses_score_threshold():
    result = SimpleNamespace(
        keypoints=SimpleNamespace(
            conf=FakeTensor(
                [
                    [0.9, 0.2, 0.25],
                    [0.1, 0.7, 0.8],
                ]
            )
        )
    )

    assert count_visible_keypoints(result, threshold=0.25) == 4
