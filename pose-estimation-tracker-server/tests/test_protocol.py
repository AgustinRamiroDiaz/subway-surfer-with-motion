from types import SimpleNamespace

from pose_estimation_tracker_server.protocol import DetectionTimings, extract_detections, make_prediction


def test_extract_detections_maps_ultralytics_pose_result_to_frontend_shape():
    result = SimpleNamespace(
        boxes=SimpleNamespace(
            xyxy=[[10, 20, 110, 220]],
            conf=[0.91],
        ),
        keypoints=SimpleNamespace(
            xy=[[[20 + index, 30 + index] for index in range(17)]],
            conf=[[0.8 for _ in range(17)]],
        ),
    )

    detections = extract_detections(result, width=320, height=240, threshold=0.45)

    assert len(detections) == 1
    assert detections[0]["label"] == "person"
    assert detections[0]["score"] == 0.91
    assert detections[0]["box"] == {
        "xmin": 10.0,
        "ymin": 20.0,
        "xmax": 110.0,
        "ymax": 220.0,
    }
    assert detections[0]["keypoints"][0] == {
        "label": "Nose",
        "x": 20.0,
        "y": 30.0,
        "score": 0.8,
    }


def test_make_prediction_uses_frontend_timing_keys():
    frame = {
        "frameId": "camera-frame-1",
        "capturedAtMs": 100,
        "width": 320,
        "height": 240,
    }
    result = SimpleNamespace(boxes=None, keypoints=None)

    prediction = make_prediction(
        frame,
        result,
        width=320,
        height=240,
        threshold=0.45,
        timings=DetectionTimings(raw_image_ms=1, preprocess_ms=2, model_ms=3, postprocess_ms=4),
    )

    assert prediction["type"] == "model-prediction"
    assert prediction["frame"] == frame
    assert prediction["detections"] == []
    assert prediction["timings"] == {
        "rawImageMs": 1,
        "preprocessMs": 2,
        "modelMs": 3,
        "postprocessMs": 4,
        "totalMs": 10,
    }
