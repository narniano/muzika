import Gtk from "gi://Gtk?version=4.0";
import GObject from "gi://GObject";

import { get_player } from "src/application.js";
import { Thumbnail } from "libmuse";
import { load_thumbnails } from "./webimage";
import { SignalListeners } from "src/util/signal-listener";
import { AdaptivePicture } from "./adaptive-picture";

export enum DynamicImageState {
  DEFAULT,
  LOADING,
  PLAYING,
  PAUSED,
}

export enum DynamicImageVisibleChild {
  IMAGE,
  PICTURE,
  NUMBER,
}

export class DynamicImage extends Gtk.Overlay {
  static {
    GObject.registerClass({
      GTypeName: "DynamicImage",
      Template:
        "resource:///com/vixalien/muzika/ui/components/dynamic-image.ui",
      InternalChildren: [
        "stack",
        "play",
        "play_image",
        "wave",
        "loading",
        "pause",
        "pause_image",
        "image_stack",
        "number",
        "check_button",
      ],
      Children: ["picture"],
      Properties: {
        "icon-size": GObject.ParamSpec.int(
          "icon-size",
          "Icon size",
          "The size of the icons inside the image",
          GObject.ParamFlags.READWRITE,
          0,
          1000000,
          0,
        ),
        "image-size": GObject.ParamSpec.int(
          "image-size",
          "Image size",
          "The size of the image",
          GObject.ParamFlags.READWRITE,
          0,
          1000000,
          0,
        ),
        "state": GObject.ParamSpec.int(
          "state",
          "State",
          "The state of the image",
          GObject.ParamFlags.READWRITE,
          DynamicImageState.DEFAULT,
          DynamicImageState.PAUSED,
          DynamicImageState.DEFAULT,
        ),
        "persistent-play-button": GObject.ParamSpec.boolean(
          "persistent-play-button",
          "Persistent play button",
          "Whether the play button should always show persistent",
          GObject.ParamFlags.READWRITE,
          true,
        ),
        "visible-child": GObject.ParamSpec.uint(
          "visible-child",
          "The visible child",
          "Whether the image, picture or number should be visible",
          GObject.ParamFlags.READWRITE,
          DynamicImageVisibleChild.IMAGE,
          DynamicImageVisibleChild.NUMBER,
          DynamicImageVisibleChild.IMAGE,
        ),
        "track-number": GObject.ParamSpec.string(
          "track-number",
          "Track Number",
          "The track number of the image",
          GObject.ParamFlags.READWRITE,
          "",
        ),
        "selection-mode": GObject.ParamSpec.boolean(
          "selection-mode",
          "Selection mode",
          "Whether the image is in selection mode",
          GObject.ParamFlags.READWRITE,
          false,
        ),
        selected: GObject.ParamSpec.boolean(
          "selected",
          "Selected",
          "Whether the image is selected",
          GObject.ParamFlags.READWRITE,
          false,
        ),
      },
      Signals: {
        pause: {},
        play: {},
        "selection-mode-toggled": {
          param_types: [GObject.TYPE_BOOLEAN],
        },
      },
    }, this);
  }

  private _stack!: Gtk.Stack;
  private _play!: Gtk.Button;
  private _play_image!: Gtk.Image;
  private _wave!: Gtk.Image;
  private _loading!: Gtk.Spinner;
  private _pause!: Gtk.Button;
  private _pause_image!: Gtk.Image;
  private _image_stack!: Gtk.Stack;
  private _number!: Gtk.Label;
  private _check_button!: Gtk.CheckButton;

  picture!: AdaptivePicture;

  private _state: DynamicImageState = DynamicImageState.DEFAULT;

  get state() {
    return this._state;
  }

  set state(state: DynamicImageState) {
    if (this._state === state) return;

    this._state = state;
    this.update_stack(this.controller.contains_pointer);
  }

  get icon_size() {
    return this._wave.pixel_size;
  }

  set icon_size(size: number) {
    this._loading.width_request = size;

    const images = [this._play_image, this._wave, this._pause_image];

    for (const image of images) {
      image.remove_css_class("lowres-icon");
      image.remove_css_class("icon-dropshadow");

      image.add_css_class(size < 32 ? "lowres-icon" : "icon-dropshadow");

      image.pixel_size = size;
    }
  }

  get image_size() {
    return this._image_stack.height_request;
  }

  set image_size(size: number) {
    if (this.visible_child === DynamicImageVisibleChild.PICTURE) {
      const width = Math.ceil(size * (16 / 9));
      this._image_stack.width_request = width;
      this._image_stack.height_request = size;
      this.picture.min_width = width;
      this.picture.min_height = size;
    } else {
      this._image_stack.width_request = this._image_stack.height_request = size;
      this.picture.min_width = this.picture.min_height = size;
    }

    ["br-6", "br-9"].map((br_class) => {
      this.remove_css_class(br_class);
    });

    if (size <= 48) {
      this.add_css_class("br-6");
    } else {
      this.add_css_class("br-9");
    }
  }

  private _persistent_play_button = true;

  get persistent_play_button() {
    return this._persistent_play_button;
  }

  set persistent_play_button(persistent: boolean) {
    this._persistent_play_button = persistent;
    this.update_stack(this.controller.contains_pointer);
  }

  get selected() {
    return this._check_button.active;
  }

  set selected(selected: boolean) {
    this._check_button.active = selected;
  }

  get selection_mode() {
    return this._image_stack.visible_child === this._check_button;
  }

  set selection_mode(selection_mode: boolean) {
    if (selection_mode) {
      this._image_stack.visible_child = this._check_button;
      this.remove_css_class("card");
    } else {
      this.visible_child = this._visible_child;
    }
    this.update_stack();
  }

  private _visible_child = DynamicImageVisibleChild.IMAGE;

  get visible_child() {
    if (!this.loaded) {
      return this._visible_child;
    }

    switch (this._image_stack.visible_child) {
      case this.picture:
        return this._visible_child;
      case this._number:
        return DynamicImageVisibleChild.NUMBER;
      default:
        return this._visible_child;
    }
  }

  set visible_child(child: DynamicImageVisibleChild) {
    if (child === DynamicImageVisibleChild.NUMBER) {
      this._image_stack.visible_child = this._number;
    } else if (this.loaded) {
      switch (child) {
        case DynamicImageVisibleChild.IMAGE:
          this._image_stack.visible_child = this.picture;
          break;
        case DynamicImageVisibleChild.PICTURE:
          this._image_stack.visible_child = this.picture;
          break;
      }
    }

    if (child === DynamicImageVisibleChild.NUMBER) {
      this._play_image.icon_name = "play-white-symbolic";
      this.remove_css_class("card");
    } else {
      this._play_image.icon_name = "play-white";
      this.add_css_class("card");
    }

    this._visible_child = child;

    // recalculate the image size (for picture)
    this.image_size = this.image_size;
  }

  get track_number() {
    return this._number.label;
  }

  set track_number(number: string) {
    this._number.label = number;

    this.visible_child = DynamicImageVisibleChild.NUMBER;
  }

  private controller: Gtk.EventControllerMotion;

  constructor(props: DynamicImageProps = {}) {
    super();

    this.controller = new Gtk.EventControllerMotion();

    this.controller.connect("enter", () => {
      this.update_stack(true);
    });

    this.controller.connect("leave", () => {
      this.update_stack(false);
    });

    this.add_controller(this.controller);

    this.root_listeners.add(
      this._check_button,
      this._check_button.connect("toggled", () => {
        this.emit("selection-mode-toggled", this._check_button.active);
      }),
    );

    if (props.icon_size) this.icon_size = props.icon_size;
    if (props.image_size) this.image_size = props.image_size;
    if (props.visible_child) this.visible_child = props.visible_child;
    if (props.persistent_play_button != null) {
      this.persistent_play_button = props.persistent_play_button;
    }
    if (props.track_number) this.track_number = props.track_number.toString();
  }

  private update_stack(hovering = false) {
    let stop_spinning = true;

    let osd = false;
    let visible = true;

    if (this.selection_mode) {
      visible = false;
    } else {
      switch (this.state) {
        case DynamicImageState.DEFAULT:
          if (hovering) {
            osd = true;
            this._stack.visible_child = this._play;
          } else {
            if (this.persistent_play_button) {
              this._stack.visible_child = this._play;
            } else {
              visible = false;
            }
          }
          break;
        case DynamicImageState.LOADING:
          stop_spinning = false;
          this._stack.visible_child = this._loading;
          this._loading.spinning = true;
          osd = true;
          break;
        case DynamicImageState.PLAYING:
          if (hovering) {
            this._stack.visible_child = this._pause;
          } else {
            this._stack.visible_child = this._wave;
          }
          osd = true;
          break;
        case DynamicImageState.PAUSED:
          this._stack.visible_child = this._play;
          osd = true;
          break;
      }
    }

    this._stack.visible = visible;

    if ((stop_spinning || !this._stack.visible) && this._loading.spinning) {
      this._loading.spinning = false;
    }

    // for number, don't use osd, but instead hide the number label
    if (
      this._stack.visible &&
      this.visible_child === DynamicImageVisibleChild.NUMBER
    ) {
      this._image_stack.opacity = osd ? 0 : 1;
      this._stack.remove_css_class("osd");
    } else {
      this._image_stack.opacity = 1;
      if (osd) {
        this._stack.add_css_class("osd");
      } else {
        this._stack.remove_css_class("osd");
      }
    }
  }

  private root_listeners = new SignalListeners();

  reset_root_listeners() {
    this.root_listeners.clear();
  }

  videoId: string | null = null;
  playlistId: string | null = null;
  mode_playlist = false;

  setup_video(videoId: string, playlistId: string | null = null) {
    this.videoId = videoId;
    this.playlistId = playlistId;
  }

  private play_cb() {
    const player = get_player();

    this.emit("play");

    if (player.now_playing?.object.track.videoId === this.videoId) {
      player.play();
    } else if (this.videoId) {
      this.state = DynamicImageState.LOADING;

      if (this.playlistId) {
        player.queue.play_playlist(this.playlistId, this.videoId);
      } else {
        player.queue.play_song(this.videoId);
      }
    }
  }

  private pause_cb() {
    const player = get_player();

    this.emit("pause");

    if (this.playlistId && !this.videoId) {
      if (player.now_playing?.object.track.playlist === this.playlistId) {
        player.pause();
      }
    } else if (player.now_playing?.object.track.videoId === this.videoId) {
      player.pause();
    }
  }

  setup_playlist(playlistId: string) {
    this.playlistId = playlistId;
    this.mode_playlist = true;
  }

  clear() {
    this.reset_root_listeners();
  }

  vfunc_unroot(): void {
    this.clear();
    super.vfunc_unroot();
  }

  private loaded = false;

  load_thumbnails(
    thumbnails: Thumbnail[],
    options: Parameters<typeof load_thumbnails>[2] = this.image_size,
  ) {
    if (this.visible_child === DynamicImageVisibleChild.NUMBER) {
      return;
    }

    return load_thumbnails(
      this.picture,
      thumbnails,
      options,
    )
      .then(() => {
        this.loaded = true;
        this.visible_child = this._visible_child;
      });
  }
}

export interface DynamicImageProps
  extends Partial<Gtk.Overlay.ConstructorProperties> {
  icon_size?: number;
  image_size?: number;
  persistent_play_button?: boolean;
  visible_child?: DynamicImageVisibleChild;
  track_number?: number | string;
}
