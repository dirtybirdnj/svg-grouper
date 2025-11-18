Create an electron app.

Use the gellyscape and gellyscope for some UI inspiration.

Allow the user to upload an SVG file.

Show the list of groups or elements on the left side, and the vector art on the right side / main panel.

Allow the user to modify the stroke, stroke width, linecap style of all the layers in a group, or inidividual layers.

Allow the user to specify a line width in mm, ex: 1.0mm or 0.25mm

Allow the user to switch between strokes or fills for layers.

Workflow:

First the user will upload the file
Next they will re-order the layers as necessary, and optionally modify any color or stroke data that needs fixing.
After setting the order and colors, the user can either export the SVG or generate fills
For each group of elements that has fills, we need to generate a pattern of lines dictated by the line widths of the elements of that group.
After generating linefills (an optional step) the user can then export the data on the last step
The export process allows the user to specify the paper size (in or mm) as well as margins required on top, right, bottom, left

Good luck happy coding claude!
