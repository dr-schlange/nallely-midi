import nallely


def after_scenario(context, scenario):
    if hasattr(context, "devices"):
        nallely.stop_all_connected_devices(force_note_off=True)
