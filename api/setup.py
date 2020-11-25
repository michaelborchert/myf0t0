import setuptools

with open("README.md", "r") as fh:
    long_description = fh.read()

setuptools.setup(
    name="myf0t0",
    version="0.0.1",
    author="Michael Borchert",
    author_email="michael.borchert@gmail.com",
    description="Photo browser and viewer",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/michaelborchert/myf0t0",
    packages=setuptools.find_packages(),
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires='>=3.6',
)
