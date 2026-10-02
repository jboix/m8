# What the character notices

This page lists everything the character picks up in the browser without asking
a model, and the threshold behind each event. Update it in the same change as
the code.

- Vision runs in `apps/web/src/senses/vision`, at 12 frames a second, on frames
  scaled down to 320 pixels wide. The rules are in `derive.ts`, and the numbers
  here are the constants at the top of that file.
- Hearing runs in `apps/web/src/senses/audio`, on one-second windows of a second
  microphone track.
- None of these results leave the browser, and none are described to the model.
  The model sees the camera and hears the microphone for itself.
- The results drive the reflexes, and feed the salience filter that decides when
  he speaks without being spoken to.

## The models

`face_landmarker.task` holds three TensorFlow Lite models. They run in order, on
the CPU, through MediaPipe's wasm runtime.

| Model                            | Size   | What it does                                               |
| -------------------------------- | ------ | ---------------------------------------------------------- |
| `face_detector.tflite`           | 230 KB | BlazeFace short-range. Finds a face and returns a box.     |
| `face_landmarks_detector.tflite` | 2.6 MB | Runs on the crop inside the box. Returns 478 3D landmarks. |
| `face_blendshapes.tflite`        | 955 KB | Returns 52 expression coefficients.                        |

- The blendshape model reads 146 two-dimensional landmark positions, not pixels.
  Expressions are worked out from the shape of the face, not from the image.
- In `VIDEO` mode the detector does not run on every frame. The landmarks of one
  frame crop the next, and the detector runs again only when tracking is lost.
- The gesture recognizer works the same way: a palm detector, a hand landmark
  model, and a classifier over 21 hand landmarks.

## Expressions

The face landmarker returns 52 blendshapes per frame, each a score from 0 to 1
for one facial movement. An expression fires when any of its blendshapes reaches
**0.4**.

| Expression | Fires on                                                             | How to trigger it                        |
| ---------- | -------------------------------------------------------------------- | ---------------------------------------- |
| `smile`    | `mouthSmileLeft`, `mouthSmileRight`                                  | Smile with the corners of your mouth.    |
| `surprise` | `browInnerUp`, `eyeWideLeft`, `eyeWideRight`                         | Raise your eyebrows and widen your eyes. |
| `frown`    | `browDownLeft`, `browDownRight`, `mouthFrownLeft`, `mouthFrownRight` | Pull your brows down and in.             |
| `talking`  | `jawOpen`                                                            | Open your mouth, or talk.                |

This is not emotion recognition. The coefficients measure facial movements, and
the four expressions are thresholds over them.

- A polite smile and a real smile give the same result.
- `talking` is `jawOpen`, so a yawn fires it.
- `frown` is `browDown`, so concentrating at a screen fires it.
- The scores are not calibrated per person. You may need to change
  `EXPRESSION_FLOOR` for your own face.
- The first match wins, in the order of the table. A talking smile reports
  `smile`.
- The same expression reports once every **1.5 seconds**. Holding a smile sends
  one event.

## Gestures

MediaPipe's gesture recognizer knows eight poses. Four of them are used.

| Gesture     | From                                               | Notes                                          |
| ----------- | -------------------------------------------------- | ---------------------------------------------- |
| `thumbs_up` | `Thumb_Up`                                         |                                                |
| `point`     | `Pointing_Up`                                      | The index finger points up, not at the screen. |
| `open_palm` | `Open_Palm`                                        | A still, open hand.                            |
| `wave`      | derived                                            | See below.                                     |
| none        | `Closed_Fist`, `Thumb_Down`, `Victory`, `ILoveYou` | Recognised and ignored.                        |

- A wave is derived. It is an open palm that moves sideways by **0.12 of the
  frame** within **1.4 seconds**, seen at least three times.
- To wave, open your hand and move it sideways. Rocking your wrist does not
  count.
- The recognizer tracks one hand at a time (`numHands: 1`).

## The face

| Event              | Meaning                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `vision.face`      | Where each face is, on every frame that has one. Up to three faces, each with its own `id`.         |
| `vision.face.lost` | That face unseen for **0.7 s**. The delay covers a dropped frame.                                   |
| `vision.person`    | Who that face is, once judged and whenever the judgement changes. `name` is `null` for a stranger.  |
| `presence`         | `present` on the first face, `absent` after **4 s** with none.                                      |
| `alone`            | `looking` at **4 s** with nobody, `drowsy` at **18 s**, `dozing` at **32 s**, `asleep` at **46 s**. |

- The `id` is a track: `f1`, `f2` and so on. A face keeps its id while it stays
  within a fifth of the frame of where it was last seen, through a gap of up to
  0.7 s. It says nothing about who the person is.
- The eyes follow one face at a time: the first one seen, then whoever starts
  talking.
- With "knows faces" on, a face that is at least **15%** of the frame tall and
  not turned past about thirty degrees is embedded every **2 s** by a
  MobileFaceNet (FaceX nano, 0.8 MB, 256 values). The last five embeddings are
  averaged and compared with every face he knows. Above a cosine of **0.45** it
  is that person; below, a stranger. The score is in the event and in the log.
- The position is the nose tip (landmark 1). It moves less than the centre of a
  bounding box when the head turns.
- The size is the vertical extent of all 478 landmarks, as a fraction of the
  frame. It tells you roughly how close the person is.
- Facing compares the nose against the midpoint of the outer eye corners
  (landmarks 33 and 263). A face square to the screen scores 1. A score above
  **0.62** counts as looking at the screen.
- Every coordinate is normalised from 0 to 1 and mirrored. Moving to your right
  raises `x`.

## Motion

Motion comes from frame differencing, not from a model. It notices a door
opening behind you, which the face landmarker cannot.

- Each frame is reduced to a 24 by 24 grid of brightness.
- A cell counts as changed when it moves by **14** of 255, which is above sensor
  noise.
- The event carries the centroid of the changed cells and a magnitude. The
  magnitude is the fraction of cells that changed, multiplied by 4 and capped
  at 1.

The gaze arbiter applies three rules to motion:

| Rule                                                   | Why                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Only motion above **0.42** moves the eyes.             | Smaller changes are not worth a glance.                                     |
| One glance every **2.2 seconds** at most.              | A person in front of a camera makes motion on almost every frame.           |
| Motion within **0.75** of the tracked face is ignored. | Your own arm should not pull his eyes off your face. The field is 2 across. |

## Reflexes

The reflexes are in `apps/web/src/eyes/reflexes.ts` and the gaze arbiter. They
use no model.

| He sees         | He does                                                              |
| --------------- | -------------------------------------------------------------------- |
| A face          | Looks at you. The movement is multiplied by 2.4.                     |
| Motion          | Glances at it for 0.75 s. A glance outranks the model's `look_at`.   |
| `wave`          | Plays a `double_take`, unless he is sleepy.                          |
| Nobody for 4 s  | Looks around. He asks where you went after he finishes his sentence. |
| Nobody for 18 s | Plays a `yawn` and becomes a little `sleepy`.                        |
| Nobody for 32 s | Plays a `slow_blink` and becomes more `sleepy`.                      |
| Nobody for 46 s | Falls asleep. The session closes three seconds later.                |
| Someone again   | Returns to neutral and plays `wide_eyes`, if he had become sleepy.   |

- The reflexes never choose an emotion, except `sleepy` when nobody is there.
  The model chooses every other expression through `set_emotion`.
- His micro-saccades drop to about a third while he follows a target. On a
  moving gaze they look like jitter.

## What the model can do

The model controls the character through five tools. The server builds their
declarations from one registry in `packages/shared/src/tools.ts`.

| Tool          | Arguments                                          | What happens                                             |
| ------------- | -------------------------------------------------- | -------------------------------------------------------- |
| `set_emotion` | One of thirteen emotions, always at full strength. | The face changes, through the springs.                   |
| `gesture`     | One of eight gestures.                             | A one-shot animation plays over the current expression.  |
| `look_at`     | One of seven targets, `hold_ms`.                   | The gaze arbiter resolves the target and holds it.       |
| `remember`    | A sentence, a kind, an importance 1 to 5.          | The server stores a fact.                                |
| `recall`      | A few keywords.                                    | The server searches the facts and returns the best five. |

- Gaze targets are names, never coordinates. The arbiter resolves a name against
  what the senses last reported.
- `speaker` and `nearest_face` resolve to the tracked face. `motion` resolves to
  where something last moved.
- `away`, `up_thinking`, `down` and `around` resolve to fixed directions.
- A target that names someone who is not there resolves to straight ahead.
- Three sources claim the gaze. A reflex glance beats the model, and the model
  beats the idle wander.

## When he speaks without being spoken to

Each event adds a weighted charge to the salience filter. The charge leaks away
over time, and the filter fires when the charge crosses a threshold that mood
sets.

| Outcome | When                                                                                                             | Effect                                   |
| ------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Dropped | Somebody has the floor, or had it in the last **6 s**, or the fire was under **1.45 times** the threshold.       | Nothing. Nothing is kept for later.      |
| Said    | The fire is large enough, the floor has been free for **6 s**, and the last `[idle]` line was over **20 s** ago. | One `[idle]` line goes into the session. |

- A repeated event counts for less each time, and recovers when it stops. The
  first wave can make him speak. The fifth is ignored.
- Boredom lowers the threshold. Conversation raises it.
- With somebody present and silent, he prompts after **22 s**, waits 1.8 times
  longer before each next prompt, and stops after three.
- When a face has just gone, he is sent one `[away]` line after the floor has
  been free for **1.5 s**. It is not sent after he becomes drowsy.
- Every `[idle]` and `[away]` line ends with the time.

## Sound

Hearing uses a second microphone track with echo cancellation, noise suppression
and automatic gain switched off. The conversation track has all three on, and
they remove music and room sound.

- The second track is a second `getUserMedia` call, not a `track.clone()`. A
  clone shares the processing of its source and ignores new constraints.
- YAMNet scores each 0.975-second window against the 521 AudioSet classes, in a
  worker.
- `sound-labels.ts` keeps twenty groups. The group is the label he uses, and the
  key that habituation counts. A bark, a howl and a growl are all "a dog".

| Label               | From classes like                    |
| ------------------- | ------------------------------------ |
| music               | Music, Singing, Guitar, Drum kit     |
| a dog               | Dog, Bark, Howl, Growling            |
| a cat               | Cat, Meow, Purr                      |
| a knock at the door | Knock, Door, Doorbell, Slam          |
| someone laughing    | Laughter, Giggle, Chuckle            |
| an alarm going off  | Alarm, Siren, Smoke detector, Buzzer |
| a phone ringing     | Telephone bell ringing, Ringtone     |
| a baby crying       | Baby cry, Crying, sobbing            |
| something break     | Glass, Shatter, Crash                |

The other groups are typing, clapping, whistling, running water, traffic,
footsteps, a bird outside, a vacuum cleaner, a television, keys jingling and
someone coughing.

Speech is recognised and discarded, because the conversation track already
carries the words to the model.

| Rule                                            | Detail                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A score under **0.45** is ignored.              | The classifier produces low scores constantly.                                                      |
| A sound is reported once.                       | It counts as new again after **12 seconds** of absence, which covers the gap between two songs.     |
| A bang is a separate event, `sound.loud`.       | A window **18 dB** louder than the one before, and above -34 dBFS. No second bang within **1.8 s**. |
| The first window after opening is never a bang. | There is no earlier window to compare it with.                                                      |

A door slam produces both a `sound.loud` and a `sound.class`.

### He does not hear himself

The raw track has no echo cancellation, so it picks up the speakers.

- Filtering `Speech` out of the results is not enough, because a synthesised
  voice can score as music.
- `start-hearing.ts` samples the speaking flag ten times a second.
- It discards every window that overlaps his own voice, plus **700 ms** after.
- Those windows never reach the classifier.

## The mouse

With no camera, the pointer takes the place of a face.

- It publishes the same `vision.face` events, so the gaze arbiter treats it as a
  face.
- A session recorded with a mouse replays as if someone had been there.
- The camera takes over whenever it is running, because two sources at the same
  priority would compete for the gaze.

## Watching it work

You can watch all of this in the debug rig, which development builds include.

- Open the **senses** tab. The preview draws a box on the face, brighter when
  you face the screen, and a mark where something moved.
- The line under the preview shows presence, the face, the last expression and
  the last gesture.
- The room sounds line shows the level of the second track in dB. It falls
  silent while he talks.
- Open the **log** tab to see every event as it happens.
